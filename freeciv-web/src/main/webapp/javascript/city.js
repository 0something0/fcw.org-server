/**********************************************************************
    Freeciv-web - the web version of Freeciv. http://play.freeciv.org/
    Copyright (C) 2009-2015  The Freeciv-web project

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

***********************************************************************/


var cities = {};
var city_rules = {};
var city_trade_routes = {};

/* saved state of checkboxes in city list that need to be restored if screen
 * gets redrawn to show changes (after a buy or change prod event): */
var city_checkbox_states= {};
var master_checkbox = false;     // header checkbox for toggling all selections
var retain_checkboxes_on_update = false; // whether next city list redraw retains cb's

var goods = {};

var active_city = null;

var closed_dialog_already = false; // differentiate user closing vs. triggered event closing of city dialog

var inactive_city = null;   // active_city's twin, to prevent request_city_buy from needing active_city which then forces city_dialog to pop up.
var prod_selection_city =null;  // the city_id whose current production will be used to set the current production in all selected cities. 

var worklist_dialog_active = false;
var production_selection = [];
var worklist_selection = [];

/* The city_options enum. */
var CITYO_DISBAND      = 0;
var CITYO_NEW_EINSTEIN = 1;
var CITYO_NEW_TAXMAN   = 2;
var CITYO_LAST         = 3;

var FEELING_BASE = 0;		/* before any of the modifiers below */
var FEELING_LUXURY = 1;		/* after luxury */
var FEELING_EFFECT = 2;		/* after building effects */
var FEELING_NATIONALITY = 3;  	/* after citizen nationality effects */
var FEELING_MARTIAL = 4;	/* after units enforce martial order */
var FEELING_FINAL = 5;		/* after wonders (final result) */

var MAX_LEN_WORKLIST = 64;

var INCITE_IMPOSSIBLE_COST = (1000 * 1000 * 1000);

var city_tab_index = 0;
var city_prod_clicks = 0;

var city_screen_updater = new EventAggregator(update_city_screen, 250,
                                              EventAggregator.DP_NONE,
                                              250, 3, 250);

/* Information for mapping workable tiles of a city to local index */
var city_tile_map = null;

var opt_show_unreachable_items = false;
var opt_show_improvements_only = false;

// refresh superpanel for this city when update_city_screen called:
var active_superpanel_cityid = -1; 
// don't reset the above var to -1 if waiting for user input on a dialog:
var active_superpanel_dialog_refresh_delay = false;

/**************************************************************************
 ...
**************************************************************************/
function city_tile(pcity)
{
  if (pcity == null) return null;

  return index_to_tile(pcity['tile']);
}

/**************************************************************************
 ...
**************************************************************************/
function city_owner_player_id(pcity)
{
  if (pcity == null) return null;
  return pcity['owner'];
}

/**************************************************************************
 ...
**************************************************************************/
function city_owner(pcity)
{
  return players[city_owner_player_id(pcity)];
}

/**************************************************************************
 Removes a city from the game
**************************************************************************/
function remove_city(pcity_id)
{
  if (pcity_id == null || client.conn.playing == null) return;
  var pcity = cities[pcity_id];
  if (pcity == null) return;

  var update = client.conn.playing.playerno &&
               city_owner(pcity).playerno == client.conn.playing.playerno;
  var ptile = city_tile(cities[pcity_id]);
  delete cities[pcity_id];
  if (renderer == RENDERER_WEBGL) update_city_position(ptile);
  if (update) {
    city_screen_updater.update();
    bulbs_output_updater.update();
  }
}

/**************************************************************************
 ...
**************************************************************************/
function is_city_center(city, tile) {
  return (city['tile'] == tile['index']);
}

/**************************************************************************
 ...
**************************************************************************/
function is_free_worked(city, tile) {
  return (city['tile'] == tile['index']);
}

/**************************************************************************
 ...
 **************************************************************************/
function is_capital(city) {
  return city_has_building(city, improvement_id_by_name(B_PALACE_NAME));
}


/**************************************************************************
 ...
**************************************************************************/
function show_city_dialog_by_id(pcity_id)
{
  //console.log(" show_city_dialog_by_id  caller is " + show_city_dialog_by_id.caller);

  show_city_dialog(cities[pcity_id]);
}

/**************************************************************************
  Used to lower font for improvements with a long word in them
**************************************************************************/
function findLongestWord(str) {
  var strSplit = str.split(' ');
  var longestWord = 0;
  for(var i = 0; i < strSplit.length; i++){
    if(strSplit[i].length > longestWord){
	     longestWord = strSplit[i].length;
     }
  }
  return longestWord;
}

/**************************************************************************
 Show the city dialog, by loading a Handlebars template, and filling it
 with data about the city.
**************************************************************************/
function show_city_dialog(pcity)
{
  //console.log("show_city_dialog() called.")
  //console.log("    caller is " + show_city_dialog.caller.toString().substring(0,35));

  var turns_to_complete;
  var sprite;
  //var shield_sprite;
  var punit;

  if (active_city != pcity || active_city == null) {
    city_prod_clicks = 0;
    production_selection = [];
    worklist_selection = [];
  }

  if (active_city != null) close_city_dialog_trigger();
  active_city = pcity;
  if (pcity == null) return;

  // reset dialog page.
  $("#city_dialog").remove();

  $("<div id='city_dialog'></div>").appendTo("div#game_page");

  var city_data = {};

  $("#city_dialog").html(Handlebars.templates['city'](city_data));

  $("#city_canvas").click(city_mapview_mouse_click);

  show_city_traderoutes();
  show_city_happy_tab();

  var dialog_buttons = {};

  if (!is_small_screen() && !touch_device) {
    dialog_buttons = $.extend(dialog_buttons,
      {
       "Previous city (P)" : function() {
         previous_city();
       },
       "Next city (N)" : function() {
         next_city();
       },
       "Buy (B)" : function() {
         request_city_buy();
       },
       "Rename" : function() {
         rename_city();
       }
     });
     dialog_buttons = $.extend(dialog_buttons, {"Exit": close_city_dialog_trigger});
  } else {   // small screen control buttons
       dialog_buttons = $.extend(dialog_buttons,
         {
          "Next" : function() {
            next_city();
          },
          "Buy" : function() {
            request_city_buy();
          }
        });
        dialog_buttons = $.extend(dialog_buttons, {"Exit": close_city_dialog_trigger});
   }

  $("#city_dialog").attr("title", decodeURIComponent(pcity['name'])
                         + " (" + pcity['size'] + ")");
  $("#city_dialog").dialog({
			bgiframe: true,
			modal: false,
			width: is_small_screen() ? "98%" : "80%",
                        height: is_small_screen() ? $(window).height() + 10 : $(window).height() - 80,
                        close : close_city_dialog,
            buttons: dialog_buttons
                   }).dialogExtend({
                     "minimizable" : true,
                     "closable" : true,
                     "minimize" : function(evt, dlg){ set_default_mapview_active(); },
                     "icons" : {
                       "minimize" : "ui-icon-circle-minus",
                       "restore" : "ui-icon-bullet"
                     }});

  $("#city_dialog").dialog('widget').keydown(city_keyboard_listener);

  /* We can potential adjust the button pane for Next/Buy/Exit here
  $("#city_dialog").dialog('widget').children().css( {"margin-top":"20px", "padding":"0px", "visibility":"hidden"} ); */

  if (is_small_screen()) { // Next/Buy/Close buttons, more compact for Mobile
    $("#city_dialog").dialog('widget').children().children().children().css( {"padding-top":"2px", "padding-bottom":"3px", 
        "padding-right":"6px", "padding-left":"6px", "margin-bottom":"3px", "margin-right":"0px" } );
  }
  $("#city_dialog").dialog('open');
  $("#game_text_input").blur();

  /* prepare city dialog for small screens. */
  if (!is_small_screen()) {
    //$("#city_tabs-5").remove();     // whatever this tab was, it was removed
    $("#city_tabs-6").remove();       // "Inside" tab for units, not needed on large screen.
    $(".extra_tabs_small").remove();  // class identified for "Inside" tab for units, not needed on large screen.
    $("#mobile_cma_checkbox").remove();
  } else {
    //$("#city_tabs-4").remove();     // Options tab formerly removed; made inconsistent tab indices
    //$(".extra_tabs_big").remove();  // Options tab formerly removed; disallowed disbanding s1 cities on mobile!
    //$("#city_stats").hide();        // There was no need to hide city stats info after moving units to its own tab
    var units_element = $("#city_improvements_panel").detach();  // Remove this from main tab and put it in "Inside" tab
    $('#city_units_tab').append(units_element);  // "Inside" tab:units inside
    $("#city_tabs").css( {"margin":"-21px", "margin-top":"-11px"} ); // Compact tabs for mobile fit
    // Abbreviate tab title buttons to fit.
    $("#ct0").html("Main");     $("#ct1").html("Prod");
    $("#ct2").html("Routes");   $("#ct3").html("Option");
    $("#ct4").html("Happy");    $("#ct5").html("Inside"); 
   }

  $("#city_tabs").tabs({ active: city_tab_index});

  $(".citydlg_tabs").height(is_small_screen() ? $(window).height() - 110 : $(window).height() - 225);

  city_worklist_dialog(pcity);
  $("#worklist_dialog_headline").unbind('click');
  $("#worklist_dialog_headline").click(function(ev) { ev.stopImmediatePropagation(); city_remove_current_prod()} );

  var orig_renderer = renderer;
  renderer = RENDERER_2DCANVAS;
  set_city_mapview_active();

  // Center map on area around city for when they leave the city
  save_map_return_position(city_tile(pcity)); //save tile locations for shift-spacebar return position function
  center_tile_mapcanvas(city_tile(pcity));
  update_map_canvas(0, 0, mapview['store_width'], mapview['store_height']);
  renderer = orig_renderer;

  var pop_string = is_small_screen() ? city_population(pcity)+"K" : numberWithCommas(city_population(pcity)*1000);
  var change_string = is_small_screen() ? "Growth:" : "Change in: ";
  $("#city_size").html("Population: "+ pop_string + "<br>"
                       + "Size: " + pcity['size'] + "<br>"
                       + "Grain: " + pcity['food_stock'] + "/" + pcity['granary_size'] + "<br>"
                       + change_string + city_turns_to_growth_text(pcity));

  var prod_type = get_city_production_type_sprite(pcity);
  var prod_string = "<b>" + (prod_type != null ? prod_type['type']['name']+"</b>" : "None</b>");
  if (is_small_screen() && prod_type != null && prod_type['type']['name'].length>18) 
    prod_string = "<span style='font-size:90%'>" + prod_string + "</span>";
  $("#city_production_overview").html(prod_string);

  turns_to_complete = get_city_production_time(pcity);

  if (turns_to_complete != FC_INFINITY) {
    $("#city_production_turns_overview").html(turns_to_complete + " turns &nbsp;&nbsp;(" + get_production_progress(pcity) + ")");
  } else {
    $("#city_production_turns_overview").html("-");
  }
  
  /*if (turns_to_complete != FC_INFINITY) {
    $("#city_production_turns_overview").html(turns_to_complete + " turns &nbsp;&nbsp;(" + get_production_progress(pcity) + ")");
  } else {
    $("#city_production_turns_overview").html("-");
  }*/
    
  if (city_has_building(pcity, improvement_id_by_name(B_AIRPORT_NAME))) {     
     $("#city_dialog_info").css("padding-bottom","3px");
     var airlift_send_text;
     var airlift_font_size = '1em;'
     if (game_info['airlifting_style'] & 4) {
        airlift_send_text = "&infin;";      
        airlift_font_size = '2em;'
     }
     else
     {
        airlift_send_text = Math.max(0,pcity["airlift"])+"/"+effects[1][0]["effect_value"]
     }
     var city_airlift_capacity_html = '<div id="airlift_send_capacity" title="Airlift send capacity"><div style="float:left"><img src="/images/orders/airlift.png" height="26" width="26"></div><div style="font-size:'+airlift_font_size+'float:left;height:26px;line-height:26px;margin-left:1px">'+airlift_send_text+'</div></div>';
     if (game_info['airlift_dest_divisor'] > 0) {
         airlift_font_size = '1em;'
         var airlift_receive_text;  
         if (game_info['airlifting_style'] & 8) {
            airlift_receive_text = "&infin;";   
            airlift_font_size = '2em;'
         }
         else {
            var airlift_receive_max_capacity = Math.round(pcity['size'] / game_info['airlift_dest_divisor']);
            airlift_receive_text = Math.max(0,pcity["airlift"] + airlift_receive_max_capacity - effects[1][0]['effect_value'])+"/"+airlift_receive_max_capacity;             
         }
         city_airlift_capacity_html += '<div id="airlift_receive_capacity" title="Airlift receive capacity"><div style="float:left;"><img src="/images/airlift-dest.png" height="26" width="26"></div><div style="font-size:'+airlift_font_size+'float:left;height:26px;line-height:26px;margin-left:1px">'+airlift_receive_text+'</div></div>';
     }
     $("#city_airlift_capacity").html(city_airlift_capacity_html);
     $("#airlift_send_capacity").tooltip();
     $("#airlift_receive_capacity").tooltip();
  }

  var reduction_pct;
  var longest_word;
  var long_name_font_reducer = "";
  var improvements_html = "";
  for (var z = 0; z < ruleset_control.num_impr_types; z ++) {
    if (pcity['improvements'] != null && pcity['improvements'].isSet(z)) {
       sprite = get_improvement_image_sprite(improvements[z]);
       if (sprite == null) {
         console.log("Missing sprite for improvement " + z);
         continue;
       }
       // Reduce font size for city improvements with long names so they don't overwrite each other.
       // Also move long names 6px left to use unused margin space.
       long_name_font_reducer = "<div>"; // Default to a plain div with no style adjustment.
       longest_word = findLongestWord(improvements[z]['name']); // Find longest word in city improvement name
       if (improvements[z]['name'].length==10) longest_word = 10; // Two word names 10 long don't get new line, so treat like 1 word.
       reduction_pct = 100-(longest_word-7)*5;    // For words over 7 in length, reduce font 5% for each letter over 7 length.
       if (reduction_pct<70) reduction_pct = 70;  // Maximum 30% reduction in size.
       // Now generate the special style adjustment for longer names, to reduce the font size and adjust margin:
       if (longest_word>7) long_name_font_reducer ="<div style='margin-left:-6px; font-size:"+reduction_pct+"%;'>";

      improvements_html = improvements_html +
       "<div id='city_improvement_element'><div style='background: transparent url("
           + sprite['image-src'] +
           ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
           + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left; '"
           + "title=\"" + improvements[z]['helptext'].replace(stripChar, "") + "\" "
	   + "onclick='city_sell_improvement(" + z + ");'>"
           +"</div>"+ long_name_font_reducer+improvements[z]['name']+"</div>" + "</div>";
    }
  }
  $("#city_improvements_list").html(improvements_html);

  var punits = tile_units(city_tile(pcity));
  if (punits != null) {
    var present_units_html = "";
    for (var r = 0; r < punits.length; r++) {
      punit = punits[r];
      sprite = get_unit_image_sprite(punit);
      if (sprite == null) {
         console.log("Missing sprite for " + punit);
         continue;
       }
        //Unit sprite for present domestic unit:
        if (punit['owner'] == client.conn.playing.playerno) { 
          present_units_html = present_units_html +
          "<div class='game_unit_list_item' title='" + get_unit_city_info(punit)
              + "' style='cursor:pointer;cursor:hand; background: transparent url("
              + sprite['image-src'] +
              ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
              + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left; '"
              + " onclick='city_dialog_activate_unit(units[" + punit['id'] + "]);'"
              +"></div>";
        } else { // foreign unit gets a flag drawn on it too
          //console.log("Unit present."); 
          var tag = nations[players[punit['owner']]['nation']]['graphic_str'] 
          
          var civ_flag_url = "";
          
          if (!nations[players[punit['owner']]['nation']]['customized'] ) {
            civ_flag_url += "/images/flags/" + tag + "-web" + get_tileset_file_extention();
            
              // flag
              present_units_html = present_units_html +
              "<div class='game_unit_list_item' title='" + nations[players[punit['owner']]['nation']]['adjective'] 
                  + "' style='cursor:pointer;cursor:hand; background: transparent url("
                  + civ_flag_url 
                  + "); background-size:contain; width:21px; height:14px; float:left; ' "
                  + "onclick='city_dialog_activate_unit(units[" + punit['id'] + "]);'"
                  +"></div>";
              
              // unit  
              present_units_html = present_units_html +
              "<div class='game_unit_list_item' title='" + get_unit_city_info(punit)
                  + "' style='cursor:pointer;cursor:hand; background: transparent url("
                  + sprite['image-src'] +
                  ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
                  + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left; margin-left:-21px; martin-top:-14px;'"
                  + " onclick='city_dialog_activate_unit(units[" + punit['id'] + "]);'"
                  +"></div>";
          }
        }
        present_units_html = present_units_html + get_html_vet_sprite(punit);
        //if (show_unit_movepct) present_units_html = present_units_html + get_html_mp_sprite(punit, false); // TO DO: showing both hp&mp messes up flow
        present_units_html = present_units_html + get_html_hp_sprite(punit, false);
        present_units_html = present_units_html + get_html_activity_sprite(punit);
      }
      $("#city_present_units_list").html(present_units_html);
      // trick to compensate for removed scrollbar clipping the top:
      $("#city_present_units_list").css({"margin-top":"-20px","padding-top":"20px"});
    }
  

  var sunits = get_supported_units(pcity);
  if (sunits != null) {
    var supported_units_html = "";
    for (var t = 0; t < sunits.length; t++) {
      punit = sunits[t];
      sprite = get_unit_image_sprite(punit);
      if (sprite == null) {
         console.log("Missing sprite for " + punit);
         continue;
       }

      supported_units_html = supported_units_html +
       "<div class='game_unit_list_item' title='" + get_unit_city_info(punit)
           + "' style='cursor:pointer;cursor:hand; background: transparent url("
           + sprite['image-src'] +
           ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
           + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left; '"
           + " onclick='city_dialog_activate_unit(units[" + punit['id'] + "]);'"
           +"></div>";
      supported_units_html = supported_units_html + get_html_vet_sprite(punit)
                                                  + get_html_hp_sprite(punit,false) 
                                                  + get_html_activity_sprite(punit);
    }
    $("#city_supported_units_list").html(supported_units_html);
    // trick to compensate for removed scrollbar clipping the top:
    $("#city_supported_units_list").css({"margin-top":"-20px","padding-top":"20px"});
  }
  $(".game_unit_list_item").tooltip();

  if ('prod' in pcity && 'surplus' in pcity) {
    var food_txt = pcity['prod'][O_FOOD] + " ( ";
    if (pcity['surplus'][O_FOOD] > 0) food_txt += "+";
    food_txt += pcity['surplus'][O_FOOD] + ")";

    var shield_txt = pcity['prod'][O_SHIELD] + " ( ";
    if (pcity['surplus'][O_SHIELD] > 0) shield_txt += "+";
    shield_txt += pcity['surplus'][O_SHIELD] + ")";

    var trade_txt = pcity['prod'][O_TRADE] + " ( ";
    if (pcity['surplus'][O_TRADE] > 0) trade_txt += "+";
    trade_txt += pcity['surplus'][O_TRADE] + ")";

    var gold_txt = pcity['prod'][O_GOLD] + " ( ";
    if (pcity['surplus'][O_GOLD] > 0) gold_txt += "+";
    gold_txt += pcity['surplus'][O_GOLD] + ")";

    var luxury_txt = pcity['prod'][O_LUXURY];
    var science_txt = pcity['prod'][O_SCIENCE];

    $("#city_food").html(food_txt);
    $("#city_prod").html(shield_txt);
    $("#city_trade").html(trade_txt);
    $("#city_gold").html(gold_txt);
    $("#city_luxury").html(luxury_txt);
    $("#city_science").html(science_txt);

    $("#city_corruption").html(pcity['waste'][O_TRADE]);
    $("#city_waste").html(pcity['waste'][O_SHIELD]);
    $("#city_pollution").html(pcity['pollution']);
  }

  /* Handle citizens and specialists */
  var specialist_html = "";
  var citizen_types = ["angry", "unhappy", "content", "happy"];
  for (var s = 0; s < citizen_types.length; s++) {

    // The line right below the line below this, was throwing undefined errors, test hack to see if this avoids it:
    if (pcity == null || pcity['ppl_' + citizen_types[s]].length<1 || pcity['ppl_' + citizen_types[s]] == null) continue;
    if (pcity['ppl_' + citizen_types[s]] == null) continue;
    for (var i = 0; i < pcity['ppl_' + citizen_types[s]][FEELING_FINAL]; i ++) {
      sprite = get_specialist_image_sprite("citizen." + citizen_types[s] + "_"
         + (i % 2));
      specialist_html = specialist_html +
      "<div class='specialist_item' style='background: transparent url("
           + sprite['image-src'] +
           ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
           + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left; '"
           +" title='One " + citizen_types[s] + " citizen'></div>";
    }
  }

  for (var u = 0; u < pcity['specialists_size']; u++) {
    var spec_type_name = specialists[u]['plural_name'];
    var spec_gfx_key = "specialist." + specialists[u]['rule_name'] + "_0";
    for (var j = 0; j < pcity['specialists'][u]; j++) {
      sprite = get_specialist_image_sprite(spec_gfx_key);
      specialist_html = specialist_html +
      "<div class='specialist_item' style='cursor:pointer;cursor:hand; background: transparent url("
           + sprite['image-src'] +
           ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
           + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left; '"
           + " onclick='city_change_specialist(event, " + pcity['id'] + "," + specialists[u]['id'] + ");'"
           +" title='" + spec_type_name + " (click to change)'></div>";

    }
  }
  
  $('#specialist_panel').html(specialist_html);
  
  var rapture_citizen_html = "";
            
  for (var i = 0; i < 4; i++) {      
      if (pcity['ppl_' + citizen_types[i]][FEELING_FINAL] > 0) {
        sprite = get_specialist_image_sprite("citizen." + citizen_types[i] + "_" + (Math.floor(i / 2)));                      
        rapture_citizen_html += "<div class='city_dialog_rapture_citizen' style='margin-right:auto;' title='"+citizen_types[i].charAt(0).toUpperCase() + citizen_types[i].slice(1)+" citizens'><div style='float:left;background: transparent url("
        + sprite['image-src'] + ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y'] + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;'>"
        +"</div><div style='float:left;height: "+sprite['height']+"px;margin-left:2px;'>"+pcity['ppl_' + citizen_types[i]][FEELING_FINAL]+"</div></div>";
      }
  }
  
  $('#rapture_citizen_panel').html(rapture_citizen_html);
  
  $('.city_dialog_rapture_citizen').tooltip({position: { my:"center bottom", at: "center top-4"}});  
  
  var city_surplus_colour = "#000000";
  var city_surplus_sign = "";
  
  if (pcity['surplus'][O_FOOD] > 0) {
      city_surplus_colour = "#007800";
      city_surplus_sign = "+";
  }

  else if (pcity['surplus'][O_FOOD] < 0) {
      city_surplus_colour = "#AC002F";
  }
  
  var rapture_food_status_html = "<div><div style='float:left;background: transparent url(/images/wheat.png);width:20px;height:20px;'></div><div style='margin-left:4px;float:left;color:"+city_surplus_colour+";'</div>"+city_surplus_sign+pcity['surplus'][O_FOOD]+"</div></div>"
            
  $('#rapture_food').html(rapture_food_status_html);
  $('#rapture_status').html("<div style='font-weight:bold;padding-bottom:9px;'>"+get_city_state(pcity)+"</div>");
  $('#rapture_status').tooltip({tooltipClass: "wider-tooltip" , position: { my:"center bottom", at: "center top-3"}}); 
  
  if (pcity['size'] >= 27) $("#city_canvas_top_div").width(pcity['size']*15-30); // Fix the specialist panel overlapping with the citizen amounts panel for bigger cities 
  
  $('#disbandable_city').off();
  $('#disbandable_city').prop('checked',
                              pcity['city_options'] != null && pcity['city_options'].isSet(CITYO_DISBAND));
  $('#disbandable_city').click(function() {
    var options = pcity['city_options'];
    var packet = {
      "pid"     : packet_city_options_req,
      "city_id" : active_city['id'],
      "options" : options.raw
    };

    /* Change the option value referred to by the packet. */
    if ($('#disbandable_city').prop('checked')) {
      options.set(CITYO_DISBAND);
    } else {
      options.unset(CITYO_DISBAND);
    }

    /* Send the (now updated) city options. */
    send_request(JSON.stringify(packet));

  });

  // HANDLE FOREIGN CITIZENS, APPEND AFTER UNIT PANELS
  var spacer = is_small_screen() ? "" : "<br>";
  var foreigners_html = "<div id='city_foreigners'>"+spacer+"Citizen nationality:";
  if (pcity['nationalities_count']>0) { // foreigners present !
    for (ethnicity in pcity['nation_id']) {
      var epop = pcity['nation_citizens'][ethnicity] == pcity['size'] ? "<font color='#005200''>ALL</font>" : pcity['nation_citizens'][ethnicity]; 
      foreigners_html += " &bull; " + nations[ players[pcity['nation_id'][ethnicity]]['nation'] ]['adjective']
                      + ": <b>" + epop + "</b>";
    }
    foreigners_html+="</div>"

    $("#city_overview_tab").append(foreigners_html);
  }

  if (is_small_screen()) {
    $(".ui-tabs-anchor").css("padding", "2px");
    $("#city_panel_stats").css( {"width":"100%", "margin-top":"17px", "padding":"0px"} );
    $("#city_panel_top").css( {"width":"100%"} );
    // Continuous horizontal scrolling for mobile:
    $("#city_improvements").css( {"width":"100%"} );
    $("#city_improvements_title").css( {"width":"4096px"} );
    $("#city_improvements_list").css( {"width":"4096px"} );
    // Continuous horizontal scrolling for mobile:
    $("#city_present_units").css( {"width":"100%"} );
    $("#city_present_units_title").css( {"width":"4096px"} );
    $("#city_present_units_list").css( {"width":"4096px"} );
    // Continuous horizontal scrolling for mobile:
    $("#city_supported_units").css( {"width":"100%"} );
    $("#city_supported_units_title").css( {"width":"4096px"} );
    $("#city_supported_units_list").css( {"width":"4096px"} );
    // Position adjustment hack
    $("#city_tabs-6").css( {"margin-top":"-20px", "padding":"0px"} );
    $("#city_dialog_info").css( {"width":"110%", "padding":"0px"} );
  }
  // Either/OR, worked better on iPad:
  if (is_small_screen() || touch_device) {
    // City tab buttons lock to bottom of screen in landscape:
    if(window.innerHeight < window.innerWidth) {
      $('#city_tabs').css( {"position":"static"} );
    }
  }
}

/**************************************************************************
 Returns the name and sprite of the current city production.
**************************************************************************/
function get_city_production_type_sprite(pcity)
{
  if (pcity == null) return null; 
  if (pcity['production_kind'] == VUT_UTYPE) {
    var punit_type = unit_types[pcity['production_value']];
    return {"type":punit_type,"sprite":get_unit_type_image_sprite(punit_type)};
  }

  if (pcity['production_kind'] == VUT_IMPROVEMENT) {
    var improvement = improvements[pcity['production_value']];
    return {"type":improvement,"sprite":get_improvement_image_sprite(improvement)};
  }

  return null;
}

/**************************************************************************
 Returns the name of the current city production.
**************************************************************************/
function get_city_production_type(pcity)
{
  if (pcity == null) return null; 
  if (pcity['production_kind'] == VUT_UTYPE) {
    var punit_type = unit_types[pcity['production_value']];
    return punit_type;
  }

  if (pcity['production_kind'] == VUT_IMPROVEMENT) {
    var improvement = improvements[pcity['production_value']];
    return improvement;
  }

  return null;
}


/**************************************************************************
 Returns the number of turns to complete current city production.
**************************************************************************/
function get_city_production_time(pcity)
{
 if (pcity == null) return FC_INFINITY;

  if (pcity['production_kind'] == VUT_UTYPE) {
    var punit_type = unit_types[pcity['production_value']];
    return city_turns_to_build(pcity, punit_type, true);
  }

  if (pcity['production_kind'] == VUT_IMPROVEMENT) {
    var improvement = improvements[pcity['production_value']];
    if (improvement['name'] == "Coinage") {
      return FC_INFINITY;
    }

    return city_turns_to_build(pcity, improvement, true);
  }

  return FC_INFINITY;
}


/**************************************************************************
 Returns city production progress, eg. the string "5 / 30"
**************************************************************************/
function get_production_progress(pcity)
{
  if (pcity == null) return " ";

  if (touch_device)
  {
    if (pcity['production_kind'] == VUT_UTYPE) {
      return "<span style='font-size:70%;'>(" + pcity['shield_stock'] + ")</span>";
    }

    if (pcity['production_kind'] == VUT_IMPROVEMENT) {
      var improvement = improvements[pcity['production_value']];
      if (improvement['name'] == "Coinage") {
        return " ";
      }
      return "<span style='font-size:70%;'>(" + pcity['shield_stock'] + ")</span>";
    }
  } else {
      if (pcity['production_kind'] == VUT_UTYPE) {
        var punit_type = unit_types[pcity['production_value']];
        return pcity['shield_stock'] + "/"
              + universal_build_shield_cost(pcity, punit_type);
      }

      if (pcity['production_kind'] == VUT_IMPROVEMENT) {
        var improvement = improvements[pcity['production_value']];
        if (improvement['name'] == "Coinage") {
          return " ";
        }
        return  pcity['shield_stock'] + "/"
                + universal_build_shield_cost(pcity, improvement);
      }
  }
  return " ";
}

/**************************************************************************
...
**************************************************************************/
function generate_production_list()
{
  var production_list = [];
  
  for (var unit_type_id in unit_types) {
    var punit_type = unit_types[unit_type_id];
    
    /* FIXME: web client doesn't support unit flags yet, so this is a hack: */
    if (punit_type['name'] == "Barbarian Leader" || punit_type['name'] == "Leader" || punit_type['name'] == "Queen" 
      || (punit_type['name'] == "Proletarians" && governments[players[client.conn.playing.playerno].government].name != "Communism")
      || (punit_type['name'] == "Pilgrims" && governments[players[client.conn.playing.playerno].government].name != "Fundamentalism") )
       continue;

    
    if (is_small_screen())
    {
      production_list.push({"kind": VUT_UTYPE, "value" : punit_type['id'],
                            "text": punit_type['name'],
                        "helptext": punit_type['helptext'].replace(stripChar, ""),
                        "rule_name": punit_type['rule_name'],
                        "build_cost": punit_type['build_cost'],
                        "unit_details": "A<b>"+punit_type['attack_strength']  
                        + "</b>D<b>"+punit_type['defense_strength']  
                        + "</b>F<b>"+punit_type['firepower'] 
                        + "</b>H<b>"+punit_type['hp'],
                         "sprite" : get_unit_type_image_sprite(punit_type)});

    } else {
      production_list.push({"kind": VUT_UTYPE, "value" : punit_type['id'],
                            "text": punit_type['name'],
	                      "helptext": punit_type['helptext'].replace(stripChar, ""),
                       "rule_name": punit_type['rule_name'],
                      "build_cost": punit_type['build_cost'],
                    "unit_details": "A<b>"+punit_type['attack_strength'] + "</b> " 
                                  + "D<b>"+punit_type['defense_strength'] + "</b> " 
                                  + "F<b>"+punit_type['firepower'] + "</b> "
                                  + "H<b>"+punit_type['hp']+"</b> "
                                  + "M<b>"+punit_type['move_rate'] / SINGLE_MOVE + "",
                          "sprite": get_unit_type_image_sprite(punit_type)});
    }
  }

  for (var improvement_id in improvements) {
    var pimprovement = improvements[improvement_id];
      var build_cost = pimprovement['build_cost'];
      var building_details = pimprovement['upkeep'];
      if (pimprovement['name'] == "Coinage") {
          build_cost = "-";
          building_details = "-";          
      }
      production_list.push({"kind": VUT_IMPROVEMENT,
                           "value": pimprovement['id'],
                            "text": pimprovement['name'],
	                      "helptext": pimprovement['helptext'].replace(stripChar, ""),
                       "rule_name": pimprovement['rule_name'],
                      "build_cost": build_cost,
                    "unit_details": building_details,
                          "sprite": get_improvement_image_sprite(pimprovement) });
  }
  return production_list;
}

/**************************************************************************
  Return whether given city can build given unit, ignoring whether unit
  is obsolete.
**************************************************************************/
function can_city_build_unit_direct(pcity, punittype)
{
  /* TODO: implement*/
  return true;
}


/**************************************************************************
  Return whether given city can build given unit; returns FALSE if unit is
  obsolete.
**************************************************************************/
function can_city_build_unit_now(pcity, punittype_id)
{
  return (pcity != null && pcity['can_build_unit'] != null
          && pcity['can_build_unit'][punittype_id] == "1");
}


/**************************************************************************
  Return whether given city can build given building; returns FALSE if
  the building is obsolete.
**************************************************************************/
function can_city_build_improvement_now(pcity, pimprove_id)
{
  return (pcity != null && pcity['can_build_improvement'] != null
          && pcity['can_build_improvement'][pimprove_id] == "1");
}


/**************************************************************************
  Return whether given city can build given item.
**************************************************************************/
function can_city_build_now(pcity, kind, value)
{
  return kind != null && value != null &&
       ((kind == VUT_UTYPE)
       ? can_city_build_unit_now(pcity, value)
       : can_city_build_improvement_now(pcity, value));
}


/**************************************************************************
  Return TRUE iff the city has this building in it.
**************************************************************************/
function city_has_building(pcity, improvement_id)
{
  return 0 <= improvement_id && improvement_id < ruleset_control.num_impr_types
    && pcity['improvements'] && pcity['improvements'].isSet(improvement_id);
}


/**************************************************************************
 Calculates the turns which are needed to build the requested
 improvement in the city.  GUI Independent.
**************************************************************************/
function city_turns_to_build(pcity, target, include_shield_stock)
{
  var city_shield_surplus =  pcity['surplus'][O_SHIELD];
  var city_shield_stock = include_shield_stock ? pcity['shield_stock'] : 0;
  var cost = universal_build_shield_cost(pcity, target);

  if (include_shield_stock == true && (pcity['shield_stock'] >= cost)) {
    return 1;
  } else if ( pcity['surplus'][O_SHIELD] > 0) {
    return Math.floor((cost - city_shield_stock - 1) / city_shield_surplus + 1);
  } else {
    return FC_INFINITY;
  }
}

/**************************************************************************
Clicking on what a city is producing from the city list activates that city
  and sets the tab to the prod tab
**************************************************************************/
function city_change_prod(city_id)
{
  active_city = city_id;
  
  city_tab_index = 1;   // 1 is the city production screen
  show_city_dialog_by_id(active_city);  // show the production screen
}

/**************************************************************************
Send buy command for a non-active city. (Called from city list or elsewhere
**************************************************************************/
function request_city_id_buy(city_id)
{
  active_city = null;               // this function called without an active city, make sure it stays that way
  inactive_city = cities[city_id];  // lets request_city_buy() know which city wants to buy
  request_city_buy();
  active_superpanel_cityid = city_id; // keep superpanel active after city list redraw
  //inactive_city = null;           // reset to null
}

/**************************************************************************
 Show buy production in city dialog
**************************************************************************/
function request_city_buy()
{
  var pcity = null;

  if (active_city == null) {
    pcity = inactive_city; // if active_city was null this function was called from city list without an active_city
  }
  else {
    pcity = active_city;
  }

  var pplayer = client.conn.playing;

  // reset dialog page.
  $("#dialog").remove();
  $("<div id='dialog'></div>").appendTo("div#game_page");
  var buy_price_string = "";
  var buy_question_string = "";

  if (pcity['production_kind'] == VUT_UTYPE) {
    var punit_type = unit_types[pcity['production_value']];
    if (punit_type != null) {
      buy_price_string = punit_type['name'] + " costs " + pcity['buy_cost'] + " gold.";
      buy_question_string = "Buy " + punit_type['name'] + " for " + pcity['buy_cost'] + " gold?";
    }
  } else {
    var improvement = improvements[pcity['production_value']];
    if (improvement != null) {
      buy_price_string = improvement['name'] + " costs " + pcity['buy_cost'] + " gold.";
      buy_question_string = "Buy " + improvement['name'] + " for " + pcity['buy_cost'] + " gold?";
    }
  }

  var treasury_text = "<br>Treasury contains " + pplayer['gold'] + " gold.";

  if (pcity['buy_cost'] > pplayer['gold']) {
    show_dialog_message("Buy It!",
      buy_price_string + treasury_text);
    return;
  }

  var dhtml = buy_question_string + treasury_text;


  $("#dialog").html(dhtml);

  $("#dialog").attr("title", "Buy It!");
  $("#dialog").dialog({
			bgiframe: true,
			modal: true,
			width: is_small_screen() ? "95%" : "50%",
			buttons: {
				"Yes": function() {
						send_city_buy();
						$("#dialog").dialog('close');
				},
				"No": function() {
						$("#dialog").dialog('close');

				}
			}
		});

  $("#dialog").dialog('open');
}


/**************************************************************************
 Buy whatever is being built in the city.
**************************************************************************/
function send_city_buy()
{
   //active_city is if player in a city dialog
   //inactive_city is if a player bought from the list without activating the city

  if (active_city != null) {
    var packet = {"pid" : packet_city_buy, "city_id" : active_city['id']};
    send_request(JSON.stringify(packet));
  }
  else if (inactive_city != null) {
    var packet = {"pid" : packet_city_buy, "city_id" : inactive_city['id']};
    send_request(JSON.stringify(packet));
  }
  else show_dialog_message("Please Report bug:", "send_city_buy() in city.js has no active or inactive city specified. Code:767");
}

/**************************************************************************
 Change city production.
**************************************************************************/
function send_city_change(city_id, kind, value)
{
  var packet = {"pid" : packet_city_change, "city_id" : city_id,
                "production_kind": kind, "production_value" : value};
  send_request(JSON.stringify(packet));
}

/**************************************************************************
 Does a simple close of the city dialog, which will trigger the
  event-based close_city_dialog() further below
**************************************************************************/
function close_city_dialog_trigger()
{
  closed_dialog_already = true;
  $("#city_dialog").dialog('close');
}

/**************************************************************************
 Close city dialog - shutdown and housekeeping: handle 4 different ways it
  could close in 2 different tabs
**************************************************************************/
function close_city_dialog()
{
  if (closed_dialog_already == false) $("#city_dialog").dialog('close');
  else closed_dialog_already = false; // reset value for next time.

  var active_tab = $("#tabs").tabs("option", "active");
  if (active_tab != TAB_MAP) {
    keyboard_input=false;  // stops ESC from propagating up to 'double-ESC' out of cities tab
    setTimeout(function(){keyboard_input=true},250); // turn back on when finished
  }
  else set_default_mapview_active();

  worklist_dialog_active = false;
  setup_window_size(); // Reset map to full size after it was a city worked tile map

  if (active_city) {  // map will be centered on city that was being viewed
    center_tile_mapcanvas(city_tile(active_city));
    active_city = null;
    if (renderer == RENDERER_2DCANVAS) update_map_canvas_full();
  } 
}

/**************************************************************************
 The city map has been clicked.
**************************************************************************/
function do_city_map_click(ptile)
{
  var packet = null;
  if (ptile['worked'] == active_city['id']) {
    packet = {"pid"     : packet_city_make_specialist,
              "city_id" : active_city['id'],
              "tile_id" : ptile['index']};
  } else {
    packet = {"pid"     : packet_city_make_worker,
              "city_id" : active_city['id'],
              "tile_id" : ptile['index']};
  }
  send_request(JSON.stringify(packet));
}

/**************************************************************************
..
**************************************************************************/
function does_city_have_improvement(pcity, improvement_name)
{
  if (pcity == null || pcity['improvements'] == null) return false;

  for (var z = 0; z < ruleset_control.num_impr_types; z++) {
    if (pcity['improvements'] != null && pcity['improvements'].isSet(z) && improvements[z] != null
        && improvements[z]['name'] == improvement_name) {
      return true;
    }
  }
  return false;
}

/**************************************************************************
  Shows the Request city name dialog to the user.
**************************************************************************/
function city_name_dialog(suggested_name, unit_id) {
  // reset dialog page.
  $("#city_name_dialog").remove();
  $("<div id='city_name_dialog'></div>").appendTo("div#game_page");

  $("#city_name_dialog").html($("<div>What should we call our new city?</div>"
                              + "<input id='city_name_req' type='text'>"));

  /* A suggested city name can contain an apostrophe ("'"). That character
   * is also used for single quotes. It shouldn't be added unescaped to a
   * string that later is interpreted as HTML. */
  /* TODO: Forbid city names containing an apostrophe or make sure that all
   * JavaScript using city names handles it correctly. Look for places
   * where a city name string is added to a string that later is
   * interpreted as HTML. Avoid the situation by directly using JavaScript
   * like below or by escaping the string. */
  $("#city_name_req").attr("value", suggested_name);

  $("#city_name_dialog").attr("title", "Build New City");
  $("#city_name_dialog").dialog({
			bgiframe: true,
			modal: true,
			width: "300",
			close: function() {
				keyboard_input=true;
			},
			buttons: [	{
					text: "Cancel",
				        click: function() {
						$("#city_name_dialog").remove();
                        keyboard_input=true;
					}
				},{
					text: "Ok",
				        click: function() {
						var name = alphanumeric_cleaner($("#city_name_req").val());
						if (name.length == 0 || name.length >= MAX_LEN_CITYNAME - 6
						    || encodeURIComponent(name).length  >= MAX_LEN_CITYNAME - 6) {
						  swal("City name is invalid. Please try a different shorter name.");
						  return;
						}

                        var actor_unit = game_find_unit_by_number(unit_id);

                        var packet = {"pid"         : packet_unit_do_action,
                                      "actor_id"    : unit_id,
                                      "target_id"   : actor_unit['tile'],
                                      "extra_id"    : EXTRA_NONE,
                                      "value"       : 0,
                                      "name"        : encodeURIComponent(name),
                                      "action_type" : ACTION_FOUND_CITY};
						send_request(JSON.stringify(packet));
						$("#city_name_dialog").remove();
						keyboard_input=true;
					}
					}
				]
		});

  $("#city_name_req").attr('maxlength', "30");

  $("#city_name_dialog").dialog('open');

  $('#city_name_dialog').keyup(function(e) {
    if (e.keyCode == 13) {
      var name = alphanumeric_cleaner($("#city_name_req").val());
      if (name.length == 0 || name.length >= MAX_LEN_CITYNAME - 6
        || encodeURIComponent(name).length  >= MAX_LEN_CITYNAME - 6) {
        swal("City name is invalid. Please try a different shorter name.");
        return;
      }
      var actor_unit = game_find_unit_by_number(unit_id);
      var packet = {"pid" : packet_unit_do_action,
                      "actor_id" : unit_id,
                      "target_id": actor_unit['tile'],
                      "extra_id" : EXTRA_NONE,
                      "value" : 0,
                      "name" : encodeURIComponent(name),
                      "action_type": ACTION_FOUND_CITY};
      send_request(JSON.stringify(packet));
	  $("#city_name_dialog").remove();
      keyboard_input=true;
    }
  });

  blur_input_on_touchdevice();
  keyboard_input=false;

  if (speech_recogntition_enabled || cardboard_vr_enabled) {
    var name = alphanumeric_cleaner($("#city_name_req").val());
    if (name.length == 0 || name.length >= MAX_LEN_CITYNAME - 6
      || encodeURIComponent(name).length  >= MAX_LEN_CITYNAME - 6) {
      swal("City name is invalid. Please try a different shorter name.");
      return;
    }
    var actor_unit = game_find_unit_by_number(unit_id);
    var packet = {"pid" : packet_unit_do_action,
                      "actor_id" : unit_id,
                      "target_id": actor_unit['tile'],
                      "extra_id" : EXTRA_NONE,
                      "value" : 0,
                      "name" : encodeURIComponent(name),
                      "action_type": ACTION_FOUND_CITY};
	send_request(JSON.stringify(packet));
	$("#city_name_dialog").remove();
    keyboard_input=true;
  }
}

/**************************************************************************
..
**************************************************************************/
function next_city()
{
  if (!client.conn.playing) return;

  update_city_screen(); // force an update:, city_screen_updater is now more
  // efficient at not firing when cities tab isn't open
  //city_screen_updater.fireNow(); for some reason this wasn't firing?

  var next_row = $('#cities_list_' + active_city['id']).next();
  if (next_row.length === 0) {
    // Either the city is not in the list anymore or it was the last item.
    // Anyway, go to the beginning
    next_row = $('#city_table tbody tr').first();
  }
  if (next_row.length > 0) {
    // If there's a city
    show_city_dialog(cities[next_row.attr('id').substr(12)]);
  }
}

/**************************************************************************
..
**************************************************************************/
function previous_city()
{
  if (!client.conn.playing) return;

  update_city_screen(); // force an update: city_screen_updater is now more
  // efficient at not firing when cities tab isn't open
  //city_screen_updater.fireNow(); for some reason this wasn't firing?

  var prev_row = $('#cities_list_' + active_city['id']).prev();
  if (prev_row.length === 0) {
    // Either the city is not in the list anymore or it was the last item.
    // Anyway, go to the end
    prev_row = $('#city_table tbody tr').last();
  }
  if (prev_row.length > 0) {
    // If there's a city
    show_city_dialog(cities[prev_row.attr('id').substr(12)]);
  }
}

/**************************************************************************
..
**************************************************************************/
function city_sell_improvement(improvement_id)
{
  city_sell_improvement_in(active_city['id'], improvement_id);
}
/**************************************************************************
 This can sell an improvement without an active city, such as from Cities
 List. It's called from SuperPanel. It will redraw the improvement pane
 several times to refresh after packet has triggered a redraw of the page.
**************************************************************************/
function city_sell_improvement_in(city_id, improvement_id)
{
  swal({
    title: "Sell Building",
    text: "Sell "+improvements[improvement_id].name+" in "+cities[city_id]['name']+"?",
    type: "warning",
    showCancelButton: true,
    confirmButtonColor: "#308030",
    confirmButtonText: "SELL",
    closeOnConfirm: true
  }, function(){
       var packet = {"pid" : packet_city_sell, "city_id" : cities[city_id]['id'],
                    "build_id": improvement_id};
        send_request(JSON.stringify(packet));
        active_superpanel_cityid = city_id;
    });
}
/**************************************************************************
  Create text describing city growth.
**************************************************************************/
function city_turns_to_growth_text(pcity)
{
  var turns = pcity['granary_turns'];
  var small = is_small_screen();

  if (turns == 0) {
    return "blocked";
  } else if (turns > 1000000) {
    return " ";
  } else if (turns == -1) {
    return small ? "<b>*starves in 1</b>" : "<b>* Starving in 1 turn</b>";  // plural to singular and bold message for starvation crisis
  } else if (turns < -1) {
    return small ? "starves in " + Math.abs(turns) : "Starving in " + Math.abs(turns) + " turns";
  } else if (turns ==1) {
    return small ? "<b>&nbsp;1 turn</b>" : "<b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1 turn</b>";
  } else {
    return turns + " turns";
  }
}

/**************************************************************************
  Returns an index for a flat array containing x,y data.
  dx,dy are displacements from the center, r is the "radius" of the data
  in the array. That is, for r=0, the array would just have the center;
  for r=1 it'd be (-1,-1), (-1,0), (-1,1), (0,-1), (0,0), etc.
  There's no check for coherence.
**************************************************************************/
function dxy_to_center_index(dx, dy, r)
{
  return (dx + r) * (2 * r + 1) + dy + r;
}

/**************************************************************************
  Converts from coordinate offset from city center (dx, dy),
  to index in the city_info['food_output'] packet.
**************************************************************************/
function get_city_dxy_to_index(dx, dy, pcity)
{
  build_city_tile_map(pcity.city_radius_sq);
  var city_tile_map_index = dxy_to_center_index(dx, dy, city_tile_map.radius);
  var ctile = city_tile(pcity);
  return get_city_tile_map_for_pos(ctile.x, ctile.y)[city_tile_map_index];
}

/**************************************************************************
  Builds city_tile_map info for a given squared city radius.
**************************************************************************/
function build_city_tile_map(radius_sq)
{
  if (city_tile_map == null || city_tile_map.radius_sq < radius_sq) {
    var r = Math.floor(Math.sqrt(radius_sq));
    var vectors = [];

    for (var dx = -r; dx <= r; dx++) {
      for (var dy = -r; dy <= r; dy++) {
        var d_sq = map_vector_to_sq_distance(dx, dy);
        if (d_sq <= radius_sq) {
          vectors.push([dx, dy, d_sq, dxy_to_center_index(dx, dy, r)]);
        }
      }
    }

    vectors.sort(function (a, b) {
      var d = a[2] - b[2];
      if (d !== 0) return d;
      d = a[0] - b[0];
      if (d !== 0) return d;
      return a[1] - b[1];
    });

    var base_map = [];
    for (var i = 0; i < vectors.length; i++) {
      base_map[vectors[i][3]] = i;
    }

    city_tile_map = {
      radius_sq: radius_sq,
      radius: r,
      base_sorted: vectors,
      maps: [base_map]
    };
  }
}

/**************************************************************************
  Helper for get_city_tile_map_for_pos.
  From position, radius and size, returns an array with delta_min,
  delta_max and clipped tile_map index.
**************************************************************************/
function delta_tile_helper(pos, r, size)
{
  var d_min = -pos;
  var d_max = (size-1) - pos;
  var i = 0;
  if (d_min > -r) {
    i = r + d_min;
  } else if (d_max < r) {
    i = 2*r - d_max;
  }
  return [d_min, d_max, i];
}

/**************************************************************************
  Builds the city_tile_map with the given delta limits.
  Helper for get_city_tile_map_for_pos.
**************************************************************************/
function build_city_tile_map_with_limits(dx_min, dx_max, dy_min, dy_max)
{
  var clipped_map = [];
  var v = city_tile_map.base_sorted;
  var vl = v.length;
  var index = 0;
  for (var vi = 0; vi < vl; vi++) {
    var tile_data = v[vi];
    if (tile_data[0] >= dx_min && tile_data[0] <= dx_max &&
        tile_data[1] >= dy_min && tile_data[1] <= dy_max) {
      clipped_map[tile_data[3]] = index;
      index++;
    }
  }
  return clipped_map;
}

/**************************************************************************
  Returns the mapping of position from city center to index in city_info.
**************************************************************************/
function get_city_tile_map_for_pos(x, y)
{
  if (topo_has_flag(TF_WRAPX)) {
    if (topo_has_flag(TF_WRAPY)) {

      // Torus
      get_city_tile_map_for_pos = function (x, y) {
        return city_tile_map.maps[0];
      };

    } else {

      // Cylinder with N-S axis
      get_city_tile_map_for_pos = function (x, y) {
        var r = city_tile_map.radius;
        var d = delta_tile_helper(y, r, map.ysize)
        if (city_tile_map.maps[d[2]] == null) {
          var m = build_city_tile_map_with_limits(-r, r, d[0], d[1]);
          city_tile_map.maps[d[2]] = m;
        }
        return city_tile_map.maps[d[2]];
      };

    }
  } else {
    if (topo_has_flag(TF_WRAPY)) {

      // Cylinder with E-W axis
      get_city_tile_map_for_pos = function (x, y) {
        var r = city_tile_map.radius;
        var d = delta_tile_helper(x, r, map.xsize)
        if (city_tile_map.maps[d[2]] == null) {
          var m = build_city_tile_map_with_limits(d[0], d[1], -r, r);
          city_tile_map.maps[d[2]] = m;
        }
        return city_tile_map.maps[d[2]];
      };

    } else {

      // Flat
      get_city_tile_map_for_pos = function (x, y) {
        var r = city_tile_map.radius;
        var dx = delta_tile_helper(x, r, map.xsize)
        var dy = delta_tile_helper(y, r, map.ysize)
        var map_i = (2*r + 1) * dx[2] + dy[2];
        if (city_tile_map.maps[map_i] == null) {
          var m = build_city_tile_map_with_limits(dx[0], dx[1], dy[0], dy[1]);
          city_tile_map.maps[map_i] = m;
        }
        return city_tile_map.maps[map_i];
      };

    }
  }

  return get_city_tile_map_for_pos(x, y);
}

/**************************************************************************
...
**************************************************************************/
function city_change_specialist(event, city_id, from_specialist_id)
{
  var city_message;

  // Standard case: cycle through 3 specialists if not mp2 rules:
  if (ruleset_control['name'] != "Multiplayer-Evolution ruleset") {
    city_message = {"pid": packet_city_change_specialist,
    "city_id" : city_id,
    "from" : from_specialist_id,
    "to" : (from_specialist_id + 1) % 3}; 
  }
  else  // mp2 has 6 specialists accessible under specific conditions
  {     // unfortuantely this has to be hard-coded because the server lets you select "dead" specialists who don't meet reqs
    var to_specialist_id = from_specialist_id + 1;
    
    // The first 3 specialists are universally accessible. Specialists 4-6 are unlocked 
    // only if the player has the Adam Smith wonder. Cycle through 3 specialists UNLESS
    // the player has Adam Smith, otherwise cycle through 6. 
    if ( player_has_wonder(client.conn.playing.playerno, improvement_id_by_name(B_ADAM_SMITH_NAME)) ) {
      if (to_specialist_id == 6) to_specialist_id = 0;
      // Hitting CTRL, ALT, or COMMAND-key optionally bypasses the 3 extra specialists:
      if ((event.ctrlKey||event.altKey||event.metaKey) && to_specialist_id >=3) to_specialist_id = 0;
    } else {
      if (to_specialist_id == 3) to_specialist_id = 0;
    } 

    city_message = {"pid": packet_city_change_specialist,
    "city_id" : city_id,
    "from" : from_specialist_id,
    "to" : to_specialist_id}; 
  }

  send_request(JSON.stringify(city_message));
  
  // shift-click: change all specialists of this type 
  if (event.shiftKey) { // for every specialist of this type, send another packet.
    for (var s=1; s<cities[city_id].specialists[from_specialist_id]; s++) { // start at s=1, because we already sent one packet
      send_request(JSON.stringify(city_message));
     }
  }
}


/**************************************************************************
...  (simplified)
**************************************************************************/
function city_can_buy(pcity)
{
  var improvement = improvements[pcity['production_value']];

  return (!pcity['did_buy'] && pcity['turn_founded'] != game_info['turn']
          && improvement['name'] != "Coinage");

}

/**************************************************************************
 Returns how many thousand citizen live in this city.
**************************************************************************/
function city_population(pcity)
{
  /*  Sum_{i=1}^{n} i  ==  n*(n+1)/2  */
  return pcity['size'] * (pcity['size'] + 1) * 5;
}


/**************************************************************************
 Rename a city
**************************************************************************/
function rename_city()
{
  if (active_city == null) return;

  // reset dialog page.
  $("#city_name_dialog").remove();
  $("<div id='city_name_dialog'></div>").appendTo("div#game_page");

  $("#city_name_dialog").html($("<div>What should we call this city?</div>"
                                + "<input id='city_name_req' type='text'>"));
  /* The city name can contain an apostrophe ("'"). That character is also
   * used for single quotes. It shouldn't be added unescaped to a
   * string that later is interpreted as HTML. */
  $("#city_name_req").attr("value", active_city['name']);
  $("#city_name_dialog").attr("title", "Rename City");
  $("#city_name_dialog").dialog({
			bgiframe: true,
			modal: true,
			width: "300",
			close: function() {
				keyboard_input=true;
			},
			buttons: [	{
					text: "Cancel",
				        click: function() {
						$("#city_name_dialog").remove();
        					keyboard_input=true;
					}
				},{
					text: "Ok",
				        click: function() {
						var name = alphanumeric_cleaner($("#city_name_req").val());
						if (name.length == 0 || name.length >= MAX_LEN_NAME - 4
						    || encodeURIComponent(name).length  >= MAX_LEN_NAME - 4) {
						  swal("City name is invalid");
						  return;
						}

						var packet = {"pid" : packet_city_rename, "name" : encodeURIComponent(name), "city_id" : active_city['id'] };
						send_request(JSON.stringify(packet));
						$("#city_name_dialog").remove();
						keyboard_input=true;
					}
					}
				]
		});
  $("#city_name_req").attr('maxlength', "30");

  $("#city_name_dialog").dialog('open');

  $('#city_name_dialog').keyup(function(e) {
    if (e.keyCode == 13) {
      var name = alphanumeric_cleaner($("#city_name_req").val());
      var packet = {"pid" : packet_city_rename, "name" : encodeURIComponent(name), "city_id" : active_city['id'] };
      send_request(JSON.stringify(packet));
      $("#city_name_dialog").remove();
      keyboard_input=true;
    }
  });
}

/**************************************************************************
 Shows breakdown of citizen happiness by cause
**************************************************************************/
function show_city_happy_tab()
{
  if (active_city == null) {
    /* No city to show. */
    return;
  }
  const pcity = active_city;
  var citizen_types = ["angry", "unhappy", "content", "happy"];
  var causes = ["Cities","Luxury","Buildings","Nationality","Units","Wonders"];
  var cause_titles = [
      "The more cities a nation has, the harder it is to govern cities with higher population. This might cause unhappiness. Details depend on government type. See help on Governments.",
      "Each city allots Luxury according to the national luxury rate, and also through Entertainers. Luxury can also be boosted indirectly by buildings such as Marketplaces.",
      "Some types of buildings directly appease citizenry without giving Luxury; for example: Temples",
      "In some rulesets, foreign nationals may be displeased if you are at war with their home nation.",
      "In some governments, military units in the city can keep order by martial law. In other governments, units deployed abroad cause unhappiness.",
      "Wonders and Palaces in the city may give bonus effects on happiness. Wonders elsewhere in the nation may give bonuses to all cities in the nation."
  ];

  var happy_tab_html = "<header><div style='font-size: 150%'><b>Citizen Happiness</b></div><br></header>";

  happy_tab_html += "<table id='happy_table' style='border=3px;border-spacing=3;padding=30;'>"
                  + "<thead id='happy_table_head'><tr>"
                  + "<th style='text-align:left;'>Cause</th><th style='text-align:left;'>Citizens</th>"
                  + "</tr></thead><tbody>";

  for (cause in causes) {
    // Cause text table cell with title
    happy_tab_html += "<tr><td><div class='happy_cause_help' title='"+cause_titles[cause]+"'>";
    happy_tab_html += causes[cause] + "</div></td>"
    // Table cell of all the people
    happy_tab_html += "<td><div>";

    //---------------------------------
    //Make a citizen sprite for each citizen based on mood type and specialist type
    //---------------------------------

      //MOODS
      var citizen_html = "";
      for (var s = 0; s < citizen_types.length; s++) {
        if (pcity == null || pcity['ppl_' + citizen_types[s]].length<1 || pcity['ppl_' + citizen_types[s]] == null) continue;
        if (pcity['ppl_' + citizen_types[s]] == null) continue;
        for (var i = 0; i < pcity['ppl_' + citizen_types[s]][cause]; i ++) {
          sprite = get_specialist_image_sprite("citizen." + citizen_types[s] + "_"
            + (i % 2));
            citizen_html = citizen_html +
          "<div class='specialist_item' style='background: transparent url("
              + sprite['image-src'] +
              ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
              + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left; '"
              +" title='One " + citizen_types[s] + " citizen'></div>";
        }
      }

      //SPECIALISTS
      for (var u = 0; u < pcity['specialists_size']; u++) {
        var spec_type_name = specialists[u]['plural_name'];
        var spec_gfx_key = "specialist." + specialists[u]['rule_name'] + "_0";
        for (var j = 0; j < pcity['specialists'][u]; j++) {
          sprite = get_specialist_image_sprite(spec_gfx_key);
          citizen_html = citizen_html +
          "<div class='specialist_item' style='cursor:pointer;cursor:hand; background: transparent url("
              + sprite['image-src'] +
              ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
              + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left; '"
              + " onclick='city_change_specialist(event, " + pcity['id'] + "," + specialists[u]['id'] + ");'"
              +" title='" + spec_type_name + " (click to change)'></div>";
        }
      }
           
      /* possible TO DO: this could be another table column that shows the total count for each mood
      var rapture_citizen_html = "";
                
      for (var i = 0; i < 4; i++) {      
          if (pcity['ppl_' + citizen_types[i]][cause] > 0) {
            sprite = get_specialist_image_sprite("citizen." + citizen_types[i] + "_" + (Math.floor(i / 2)));                      
            rapture_citizen_html += "<div class='city_dialog_rapture_citizen' style='margin-right:auto;' title='"+citizen_types[i].charAt(0).toUpperCase() + citizen_types[i].slice(1)+" citizens'><div style='float:left;background: transparent url("
            + sprite['image-src'] + ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y'] + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;'>"
            +"</div><div style='float:left;height: "+sprite['height']+"px;margin-left:2px;'>"+pcity['ppl_' + citizen_types[i]][cause]+"</div></div>";
          }
      }
      */
      //-------------------------------

    happy_tab_html += citizen_html + "</div></td></tr>";
  }

  happy_tab_html += "</tbody></table>"
  $("#city_happy_tab").html(happy_tab_html);
  $(".happy_cause_help").tooltip();

}
/**************************************************************************
 Shows traderoutes of active city
**************************************************************************/
function show_city_traderoutes()
{
  var msg;
  var routes;

  if (active_city == null) {
    /* No city to show. */
    return;
  }

  routes = city_trade_routes[active_city['id']];

  if (active_city['traderoute_count'] != 0
      && routes == null) {
    /* This city is supposed to have trade routes. It doesn't.  */
    console.log("Can't find the trade routes " + active_city['name']
                + " is said to have");
    return;
  }

  msg = "";
  for (var i = 0; i < active_city['traderoute_count']; i++) {
    var tcity_id;
    var tcity;
    var good;
    
    if (routes[i] == null) continue;

    tcity_id = routes[i]['partner'];

    if (tcity_id == 0 || tcity_id == null) {
      continue;
    }

    good = goods[routes[i]['goods']];
    if (good == null) {
      console.log("Missing goods type " + routes[i]['goods']);
      good = {'name': "Unknown"};
    }

    tcity = cities[tcity_id];
    if (tcity == null) continue;
    msg += good['name'] + " trade with " + tcity['name'];
    msg += " gives +" + routes[i]['value'] + " base trade each turn." + "<br>";
  }

  if (msg == "") {
    msg = "No traderoutes.";
    msg += " (Open the Manual, select Economy and then Trade ";
    msg += "if you want to learn more about trade and trade routes.)";
  }

  $("#city_traderoutes_tab").html(msg);  
}

/**************************************************************************
 Populates data to the production tab in the city dialog.
**************************************************************************/
function city_worklist_dialog(pcity)
{
  if (pcity == null) return;
  var universals_list = [];
  var kind;
  var value;

  if (pcity['worklist'] != null && pcity['worklist'].length != 0) {
    var work_list = pcity['worklist'];
    for (var i = 0; i < work_list.length; i++) {
      var work_item = work_list[i];
      kind = work_item['kind'];
      value = work_item['value'];
      if (kind == null || value == null || work_item.length == 0) continue;
      if (kind == VUT_IMPROVEMENT) {
        var pimpr = improvements[value];
	var build_cost = pimpr['build_cost'];
	if (pimpr['name'] == "Coinage") build_cost = "-";
	universals_list.push({"name" : pimpr['name'],
		"kind" : kind,
		"value" : value,
		"helptext" : pimpr['helptext'].replace(stripChar, ""),
		"build_cost" : build_cost,
		"sprite" : get_improvement_image_sprite(pimpr)});
      } else if (kind == VUT_UTYPE) {
        var putype = unit_types[value];
        universals_list.push({"name" : putype['name'],
		"kind" : kind,
		"value" : value,
		"helptext" : putype['helptext'].replace(stripChar, ""),
		"build_cost" : putype['build_cost'],
		"sprite" : get_unit_type_image_sprite(putype)});
      } else {
        console.log("unknown kind: " + kind);
      }
    }
  }

  var worklist_html = "<table class='worklist_table'><tr><td>Type</td><td>Name</td><td>Cost</td></tr>";
  for (var j = 0; j < universals_list.length; j++) {
    var universal = universals_list[j];
    var sprite = universal['sprite'];
    if (sprite == null) {
      console.log("Missing sprite for " + universal[j]['name']);
      continue;
    }

    worklist_html += "<tr class='prod_choice_list_item"
     + (can_city_build_now(pcity, universal['kind'], universal['value']) ?
        "" : " cannot_build_item")
     + "' data-wlitem='" + j + "' "
     + " title=\"" + universal['helptext'] + "\">"
     + "<td><div class='production_list_item_sub' "
           + "style=' background: transparent url("
           + sprite['image-src'] +
           ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
           + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;'"
           +"></div></td>"
     + "<td class='prod_choice_name'>" + universal['name'] + "</td>"
     + "<td class='prod_choice_cost'>" + universal['build_cost'] + "</td></tr>";
  }
  worklist_html += "</table>";
  $("#city_current_worklist").html(worklist_html);

  populate_worklist_production_choices(pcity);

  $('#show_unreachable_items').off('click');
  $('#show_unreachable_items').click(function() {
    opt_show_unreachable_items = !opt_show_unreachable_items;
    $('#show_unreachable_items').prop('checked', opt_show_unreachable_items);
    // TODO: properly update the selection only when needed, instead of always emptying it.
    if (production_selection.length !== 0) {
      production_selection = [];
      update_worklist_actions();
    }
    populate_worklist_production_choices(pcity);
  });

  $('#show_improvements_only').off('click');
  $('#show_improvements_only').click(function() {
    opt_show_improvements_only = !opt_show_improvements_only;
    $('#show_improvements_only').prop('checked', opt_show_improvements_only);
    // TODO: properly update the selection only when needed, instead of always emptying it.
    if (production_selection.length !== 0) {
      production_selection = [];
      update_worklist_actions();
    }
    populate_worklist_production_choices(pcity);
  });

  $('#show_unreachable_items').prop('checked', opt_show_unreachable_items);
  $('#show_improvements_only').prop('checked', opt_show_improvements_only);

  worklist_dialog_active = true;
  var turns_to_complete = get_city_production_time(pcity);
  var prod_type = get_city_production_type_sprite(pcity);
  var prod_img_html = "";
  if (prod_type != null) { 
    sprite = prod_type['sprite'];
    prod_img_html = "<div style='background: transparent url("
           + sprite['image-src']
           + ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
           + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float: left; '>"
           +"</div>";
  }

  var headline = prod_img_html + "<div id='prod_descr'>" 
    + (is_small_screen() ? "" : "<b>") 
    + (prod_type != null ? prod_type['type']['name'] : "None")
    + (is_small_screen() ? "" : "</b>"); 
  
  if (!is_small_screen() )  
    headline += " &nbsp; (" + get_production_progress(pcity) + ")";
  else
    headline += " " + get_production_progress(pcity);

  if (turns_to_complete != FC_INFINITY && !is_small_screen() ) {
    headline += ", turns: " + turns_to_complete;
  }

  if (is_small_screen() ) headline = "<span style='font-size:70%;'>"+headline+"</span>";

  $("#worklist_dialog_headline").html(headline + "</div>");
  $("#worklist_dialog_headline").css({"title":"Click to:\n1.Remove from worklist and move remaining worklist up.\n"
                                      +"2. If no worklist below, replace with highlighted selection from right.\n"});

  $(".production_list_item_sub").tooltip();

  if (is_touch_device()) {
    $("#prod_buttons").html("<x-small>1st&thinsp;tap:&thinsp;change. Next&thinsp;taps:&thinsp;add. Tap-tap:&thinsp;clear</x-small>");
  }

  $(".button").button();

  // -----------------------------hacky
  var tab_h = $("#city_production_tab").height();
  $("#city_current_worklist").height(tab_h - 150);
  $("#worklist_production_choices").height(tab_h - 121);
  /* TODO: remove all hacky sizing and positioning */
  /* It would have been nice to use $("#city_current_worklist").position().top
     for worklist_control padding-top, but that's 0 on first run.
     73 is also wrong, as it depends on text size. */
  if (tab_h > 250) {
    $("#worklist_control").height(tab_h - 148).css("padding-top", 73);
  } else {
    $("#worklist_control").height(tab_h - 77);
  }
  // Small screen in Landscape - adjustments 
  /*
  if (is_small_screen())
    if ($(window).width() > $(window).height()) {
      $("#city_current_worklist").css({"height":"auto"});
      $("#worklist_production_choices").css({"height":"auto"});
    }*/
  //-------------------

  var worklist_items = $("#city_current_worklist .prod_choice_list_item");
  var max_selection = Math.min(MAX_LEN_WORKLIST, worklist_items.length);
  for (var k = 0; k < worklist_selection.length; k++) {
    if (worklist_selection[k] >= max_selection) {
      worklist_selection.splice(k, worklist_selection.length - k);
      break;
    }
    worklist_items.eq(worklist_selection[k]).addClass("ui-selected");
  }

  if (!touch_device) {
    $("#city_current_worklist .worklist_table").selectable({
       filter: "tr",
       selected: handle_current_worklist_select,
       unselected: handle_current_worklist_unselect
    });
  } else {
    worklist_items.click(handle_current_worklist_click);
  }

  worklist_items.dblclick(handle_current_worklist_direct_remove);

  update_worklist_actions();
}

/**************************************************************************
 Update the production choices.
**************************************************************************/
function populate_worklist_production_choices(pcity)    
{
  var small = is_small_screen();

  var production_list = generate_production_list();
  var production_html = "<table class='worklist_table'><tr><td>Type</td><td>Name</td><td style='padding-right:30px; text-align:right'>Info</td><td>Cost</td></tr>";
  for (var a = 0; a < production_list.length; a++) {
    var sprite = production_list[a]['sprite'];
    if (sprite == null) {
      console.log("Missing sprite for " + production_list[a]['value']);
      continue;
    }
    var kind = production_list[a]['kind'];
    var value = production_list[a]['value'];
    var can_build = can_city_build_now(pcity, kind, value);

    // Don't show units if user clicked option to only show improvements
    if (kind == VUT_UTYPE && opt_show_improvements_only) continue;

    if (can_build || opt_show_unreachable_items) {
      production_html += "<tr class='prod_choice_list_item kindvalue_item"
       + (can_build ? "" : " cannot_build_item")
       + "' data-value='" + value + "' data-kind='" + kind + "'>"
       + "<td><div class='production_list_item_sub' title=\"" + production_list[a]['helptext'] + "\" style=' background: transparent url("
           + sprite['image-src'] +
           ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
           + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;'"
           +"></div></td>"
       + "<td class='prod_choice_name'>" + production_list[a]['text'] + "</td>";       
       
       if (kind == VUT_UTYPE /*&& !small*/) {
          production_html += "<td title='Attack/Defence/Firepower, Hitpoints' class='prod_choice_info' "
          + "style='padding-right:30px; text-align:right'>" 
          + production_list[a]['unit_details'] + "</td>";
       }
       else if (kind == VUT_IMPROVEMENT /*&& !small*/) {
          production_html += "<td title='Upkeep' class='prod_choice_info' " 
          + "style='padding-right:30px; text-align:right'>" 
          + production_list[a]['unit_details'] + "</td>";
       }
          production_html += "<td class='prod_choice_cost'>" + production_list[a]['build_cost'] + "</td></tr>";
     }
  }
  production_html += "</table>";

  $("#worklist_production_choices").html(production_html);
  $("#worklist_production_choices .production_list_item_sub").tooltip();
  $("#worklist_production_choices .prod_choice_info").tooltip();

  if (!touch_device) {
    $("#worklist_production_choices .worklist_table").selectable({
       filter: "tr",
       selected: handle_worklist_select,
       unselected: handle_worklist_unselect
    });

    if (production_selection.length > 0) {
      var prod_items = $("#worklist_production_choices .kindvalue_item");
      var sel = [];
      production_selection.forEach(function (v) {
        sel.push("[data-value='" + v.value + "']" +
                 "[data-kind='"  + v.kind  + "']");
      });
      prod_items.filter(sel.join(",")).addClass("ui-selected");
    }

    $(".kindvalue_item").dblclick(function(e) {
      var value = parseFloat($(this).data('value'));
      var kind = parseFloat($(this).data('kind'));
      
      if (e.ctrlKey || e.metaKey ) {
        city_change_production();
        return;
      }
      send_city_worklist_add(pcity['id'], kind, value);
    });
  } else {
    $(".kindvalue_item").click(function() {
      var value = parseFloat($(this).data('value'));
      var kind = parseFloat($(this).data('kind'));
      if (city_prod_clicks == 0) {
        send_city_change(pcity['id'], kind, value);
      } else {
        send_city_worklist_add(pcity['id'], kind, value);
      }
      city_prod_clicks += 1;

    });
  }
}

/**************************************************************************
 Handle selection in the production list.
**************************************************************************/
function extract_universal(element)
{
  return {
    value: parseFloat($(element).data("value")),
    kind:  parseFloat($(element).data("kind"))
  };
}

function find_universal_in_worklist(universal, worklist)
{
  for (var i = 0; i < worklist.length; i++) {
    if (worklist[i].kind === universal.kind &&
        worklist[i].value === universal.value) {
      return i;
    }
  }
  return -1;
}

function handle_worklist_select(event, ui)
{
  var selected = extract_universal(ui.selected);
  var idx = find_universal_in_worklist(selected, production_selection);
  if (idx < 0) {
    production_selection.push(selected);
    update_worklist_actions();
  }
 
 // alt click and shift-alt click
 if (event.altKey && event.shiftKey) {
  city_insert_in_worklist(); // shift-alt-click insert into first worklist position
  worklist_selection = [];
 }
 else if (event.shiftKey) {
  city_add_to_worklist(); // shift-alt-click insert into first worklist position
 }
 else if (event.altKey) {
  city_change_production();  // alt-click change current prod
 }
}

function handle_worklist_unselect(event, ui)
{
  var selected = extract_universal(ui.unselected);
  var idx = find_universal_in_worklist(selected, production_selection);
  if (idx >= 0) {
    production_selection.splice(idx, 1);
    update_worklist_actions();
  }
}

/**************************************************************************
 Handles the selection of another item in the tasklist.
**************************************************************************/
function handle_current_worklist_select(event, ui)
{
  var idx = parseInt($(ui.selected).data('wlitem'), 10);
  var i = worklist_selection.length - 1;
  while (i >= 0 && worklist_selection[i] > idx)
    i--;
  if (i < 0 || worklist_selection[i] < idx) {
    worklist_selection.splice(i + 1, 0, idx);
    update_worklist_actions();
  }
}

/**************************************************************************
 Handles the removal of an item from the selection in the tasklist.
**************************************************************************/
function handle_current_worklist_unselect(event, ui)
{
  var idx = parseInt($(ui.unselected).data('wlitem'), 10);
  var i = worklist_selection.length - 1;
  while (i >= 0 && worklist_selection[i] > idx)
    i--;
  if (i >= 0 && worklist_selection[i] === idx) {
    worklist_selection.splice(i, 1);
    update_worklist_actions();
  }
}

/**************************************************************************
 Handles an item selection from the tasklist (for touch devices).
**************************************************************************/
function handle_current_worklist_click(event)
{
  event.stopPropagation();

  var element = $(this);
  var item = parseInt(element.data('wlitem'), 10);

  if (worklist_selection.length === 1 && worklist_selection[0] === item) {
     element.removeClass('ui-selected');
     worklist_selection = [];
  } else {
     element.siblings().removeClass('ui-selected');
     element.addClass('ui-selected');
     worklist_selection = [item];
  }

  update_worklist_actions();
}

/**************************************************************************
 Enables/disables buttons in production tab.
**************************************************************************/
function update_worklist_actions()
{
  if (worklist_selection.length > 0) {
    $("#city_worklist_up_btn").button("enable");
    $("#city_worklist_remove_btn").button("enable");

    if (worklist_selection[worklist_selection.length - 1] ===
        active_city['worklist'].length - 1) {
      $("#city_worklist_down_btn").button("disable");
    } else {
      $("#city_worklist_down_btn").button("enable");
    }

  } else {
    $("#city_worklist_up_btn").button("disable");
    $("#city_worklist_down_btn").button("disable");
    $("#city_worklist_exchange_btn").button("disable");
    $("#city_worklist_remove_btn").button("disable");
  }

  if (production_selection.length > 0) {
    $("#city_add_to_worklist_btn").button("enable");
    $("#city_worklist_insert_btn").button("enable");

    if (production_selection.length == worklist_selection.length ||
        worklist_selection.length == 1) {
      $("#city_worklist_exchange_btn").button("enable");
    } else {
      $("#city_worklist_exchange_btn").button("disable");
    }

  } else {
    $("#city_add_to_worklist_btn").button("disable");
    $("#city_worklist_insert_btn").button("disable");
    $("#city_worklist_exchange_btn").button("disable");
  }

  if (production_selection.length === 1) {
    $("#city_change_production_btn").button("enable");
  } else {
    $("#city_change_production_btn").button("disable");
  }
}

/**************************************************************************
 Notifies the server about a change in the city worklist.
**************************************************************************/
function send_city_worklist(city_id)
{
  var worklist = cities[city_id]['worklist'];
  var overflow = worklist.length - MAX_LEN_WORKLIST;
  if (overflow > 0) {
    worklist.splice(MAX_LEN_WORKLIST, overflow);
  }

  send_request(JSON.stringify({pid     : packet_city_worklist,
                               city_id : city_id,
                               worklist: worklist}));
}

/**************************************************************************
...
**************************************************************************/
function send_city_worklist_add(city_id, kind, value)
{
  var pcity = cities[city_id];
  if (pcity['worklist'].length >= MAX_LEN_WORKLIST) {
    return;
  }

  pcity['worklist'].push({"kind" : kind, "value" : value});

  send_city_worklist(city_id);
}

/**************************************************************************
...
**************************************************************************/
function city_change_production()
{
  if (production_selection.length === 1) {
    send_city_change(active_city['id'], production_selection[0].kind,
                     production_selection[0].value);
  }
  // default this prod selection for mass-selection change prod button:
  set_mass_prod_city(active_city['id']);
  save_city_checkbox_states();
  retain_checkboxes_on_update = true;
}

/**************************************************************************
... 
*************************************************************************/
function city_add_to_worklist()
{
  if (production_selection.length > 0) {
    active_city['worklist'] = active_city['worklist'].concat(production_selection);
    send_city_worklist(active_city['id']);
  }
}

/**************************************************************************
  Adds improvement z to city's worklist: called from SuperPanel
*************************************************************************/
function city_add_improv_to_worklist(city_id, z)
{
  //console.log("city_add_improv_to_worklist("+cities[city_id]['name']+","+improvements[z]['name']+")");
  send_city_worklist_add(city_id, 3, z); //3=worklist genus code for improvement

  // Show confirmation message for adding to worklist.
  swal("Sent order to add "+improvements[z]['name']+" to Worklist in "+cities[city_id]['name']);
  active_superpanel_cityid = city_id;
}

/**************************************************************************
  Remove current production item from worklist (on double click)
  ...requires there to be an item below it.
*************************************************************************/
function city_remove_current_prod()
{
  var wl = active_city['worklist'];

  // if worklist items below, move them up
  if (wl.length > 0) {
    var next_item = wl[0];
    // Change production to 'next up' in the worklist
    send_city_change(active_city['id'], next_item.kind, next_item.value);

    // Since it replaces current production, remove from worklist
    wl.splice(worklist_selection[0], 1);

    // Update
    send_city_worklist(active_city['id']);
  /*} else if (production_selection.length === 1) {
    // otherwise, check for a selected item to replace it with
    send_city_change(active_city['id'], production_selection[0].kind,
                     production_selection[0].value); */
  } else {
    // reserved for double clicking it when no worklist below and not 
    // alternate replacement is selected on list to the right.
  }
}

/**************************************************************************
 Handles dblclick-issued removal
**************************************************************************/
function handle_current_worklist_direct_remove()
{
  var idx = parseInt($(this).data('wlitem'), 10);
  active_city['worklist'].splice(idx, 1);

  // User may dblclick a task while having other selected
  var i = worklist_selection.length - 1;
  while (i >= 0 && worklist_selection[i] > idx) {
    worklist_selection[i]--;
    i--;
  }
  if (i >= 0 && worklist_selection[i] === idx) {
    worklist_selection.splice(i, 1);
  }

  send_city_worklist(active_city['id']);
}

/**************************************************************************
 Inserts selected production items into the worklist.
 Inserts at the beginning if no worklist items are selected, or just before
 the first one if there's a selection.
**************************************************************************/
function city_insert_in_worklist()
{
  var count = Math.min(production_selection.length, MAX_LEN_WORKLIST);
  if (count === 0) return;

  var i;
  var wl = active_city['worklist'];

  if (worklist_selection.length === 0) {

    wl.splice.apply(wl, [0, 0].concat(production_selection));

    // Initialize the selection with the inserted items
    for (i = 0; i < count; i++) {
      worklist_selection.push(i);
    }

  } else {

    wl.splice.apply(wl, [worklist_selection[0], 0].concat(production_selection));

    for (i = 0; i < worklist_selection.length; i++) {
      worklist_selection[i] += count;
    }
  }

  send_city_worklist(active_city['id']);
}

/**************************************************************************
 Moves the selected tasks one place up.
 If the first task is selected, the current production is changed.
 TODO: Some combinations may send unnecessary updates.
 TODO: If change + worklist, we reopen the dialog twice and the second
       does not keep the tab.
**************************************************************************/
function city_worklist_task_up()
{
  var count = worklist_selection.length;
  if (count === 0) return;

  var swap;
  var wl = active_city['worklist'];

  if (worklist_selection[0] === 0) {
    worklist_selection.shift();
    if (wl[0].kind !== active_city['production_kind'] ||
        wl[0].value !== active_city['production_value']) {
      swap = wl[0];
      wl[0] = {
        kind : active_city['production_kind'],
        value: active_city['production_value']
      };

      send_city_change(active_city['id'], swap.kind, swap.value);
    }
    count--;
  }

  for (var i = 0; i < count; i++) {
    var task_idx = worklist_selection[i];
    swap = wl[task_idx - 1];
    wl[task_idx - 1] = wl[task_idx];
    wl[task_idx] = swap;
    worklist_selection[i]--;
  }

  send_city_worklist(active_city['id']);
}

/**************************************************************************
 Moves the selected tasks one place down.
**************************************************************************/
function city_worklist_task_down()
{
  var count = worklist_selection.length;
  if (count === 0) return;

  var swap;
  var wl = active_city['worklist'];

  if (worklist_selection[--count] === wl.length - 1) return;

  while (count >= 0) {
    var task_idx = worklist_selection[count];
    swap = wl[task_idx + 1];
    wl[task_idx + 1] = wl[task_idx];
    wl[task_idx] = swap;
    worklist_selection[count]++;
    count--;
  }

  send_city_worklist(active_city['id']);
}

/**************************************************************************
 Removes the selected tasks, changing them for the selected production.
**************************************************************************/
function city_exchange_worklist_task()
{
  var prod_l = production_selection.length;
  if (prod_l === 0) return;

  var i;
  var same = true;
  var wl = active_city['worklist'];
  var task_l = worklist_selection.length;
  if (prod_l === task_l) {
    for (i = 0; i < prod_l; i++) {
      if (same &&
          (wl[worklist_selection[i]].kind !== production_selection[i].kind ||
           wl[worklist_selection[i]].value !== production_selection[i].value)) {
        same = false;
      }
      wl[worklist_selection[i]] = production_selection[i];
    }
  } else if (task_l === 1) {
    i = worklist_selection[0];
    wl.splice.apply(wl, [i, 1].concat(production_selection));
    same = false;
    while (--prod_l) {
      worklist_selection.push(++i);
    }
  }

  if (!same) {
    send_city_worklist(active_city['id']);
  }
}

/**************************************************************************
 Removes the selected tasks.
**************************************************************************/
function city_worklist_task_remove()
{
  var count = worklist_selection.length;
  if (count === 0) return;

  var wl = active_city['worklist'];

  while (--count >= 0) {
    wl.splice(worklist_selection[count], 1);
  }
  worklist_selection = [];

  send_city_worklist(active_city['id']);
}

/**************************************************************************
 Creates the hover pane for hovering over a city in the city list
**************************************************************************/
function show_city_improvement_pane(city_id)
{
  // This function's purpose is depicting which improvements are present AND not present
  // therefore, it doesn't show wonders and sticks to genus==2, but it also makes improvements
  // always in the same place whether present or not, so Gestalt processing can check for the 
  // improvement.
  var pcity = cities[city_id];

  var improvements_html = "";
  var opacity = 1;
  var border = "";
  var mag_factor = ($(window).width()-519)/2450;   //.57 on 1920p

  //console.log("width: "+$(window).width()+"mag factor:"+mag_factor);
  var magnification = "zoom:"+mag_factor+"; -moz-transform:"+mag_factor+";";
  var bg = "background:#335 ";
  var title_text = "";
  var right_click_action = "oncontextmenu='city_sell_improvement_in(" +city_id+","+ z + ");' ";
  var shift_click_text = "\n\nSHIFT-CLICK: Highlight ON/OFF cities with this building.\n\nCTRL-CLICK: &#x2611; select ON/OFF cities with this building.' ";
    for (var z = 0; z < ruleset_control.num_impr_types; z ++) {
    if (pcity['improvements'] != null /*&& pcity['improvements'].isSet(z) if present*/ && improvements[z].genus==GENUS_IMPROVEMENT) {
       sprite = get_improvement_image_sprite(improvements[z]);
       if (sprite == null) {
         continue;
       }
       // Colour and text tags for current production and completion thereof:
       var product_finished = false;
       var verb = " is making ";
       var is_city_making = (pcity['production_kind'] == VUT_IMPROVEMENT && pcity['production_value']==z);
       if (is_city_making) { // colour code currently produced items which are bought/finished
         var shields_invested = pcity['shield_stock'];
         if (shields_invested>=improvements[z]['build_cost']) {
           product_finished=true;
           var verb = " is finishing ";
         } 
       }
       
      // Set cell colour/opacity based on: if present / can build 
      if (pcity['improvements'].isSet(z)) {     // city has improvement: white cell
        opacity = 1;
        border = "border:3px solid #000000;"
        bg     = "background:#FEED ";
        title_text = "title='"+pcity['name']+":\n\nRIGHT-CLICK: Sell " + improvements[z]['name']+"."+shift_click_text;
        right_click_action = "oncontextmenu='city_sell_improvement_in(" +city_id+","+ z + ");' ";
      } else {
        if (!can_city_build_improvement_now(pcity, z)) {  // doesn't have and can't build: faded
          opacity=0.35;
          border = "border:3px solid #231A13;"  
          bg =     "background:#9873 ";
          title_text = "title='" + pcity['name']+": " + improvements[z]['name'] + " unavailable.\n\nRIGHT-CLICK: Add to worklist."+shift_click_text;
          right_click_action = "oncontextmenu='city_add_improv_to_worklist(" +city_id+","+ z + ");' ";
        } else {                  // doesn't have and CAN build - dark blue
          opacity = 1;
          border = (is_city_making ? (product_finished ? "border:3px solid #308000;" : "border:3px solid #80E0FF;") : "border:3px solid #000000;");  // highlight if current prod
          bg =     (is_city_making ? (product_finished ? "background:#BFBE " : "background:#8D87 ") : "background:#147F ");
          right_click_action = "oncontextmenu='city_change_prod_and_buy(null," +city_id+","+ z + ");' "
          title_text = is_city_making 
            ? ("title='"+pcity['name']+verb+improvements[z]['name']+".\n\nRIGHT_CLICK: Buy "+improvements[z]['name']+shift_click_text)
            : ("title='"+pcity['name']+":\n\nCLICK: Change production\n\nRIGHT-CLICK: Buy "+improvements[z]['name']+shift_click_text);   
        }
      } 
      // Put improvement sprite in the cell:
      improvements_html = improvements_html +
        "<div style='padding:0px; opacity:"+opacity+"; "+magnification
            +"' id='city_improvement_element'><span style='padding:0px; margin:0px; "+border+" "+bg+" url("
            + sprite['image-src'] +
            ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
            + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;float:left;' "
            + title_text 
            + right_click_action 
            + "onclick='change_city_prod_to(event," +city_id+","+ z + ");'>"  
            +"</span></div>";
    }
  }
  $("#city_improvements_hover_list").html(improvements_html);
}
/**************************************************************************
 Changes production in city_id to improvement type #z THEN buys it
   this function is called from a click from SuperPanel in the city list 
**************************************************************************/
function city_change_prod_and_buy(event, city_id, z)
{/*
  if (event) { 
    if (event.ctrlKey) {
      // TO-DO: slice this improvement from the production queue
      return;
    }
  }*/

  // First change production
  change_city_prod_to(null, city_id, z);

  // Delay to let first packet get on its way to server
  setTimeout(function() {
    request_city_id_buy(city_id);
  }, 300);

  active_superpanel_dialog_refresh_delay = true; //wait for user input before reset
  active_superpanel_cityid = city_id; // keep panel up after refresh/update
}

/**************************************************************************
 Changes production in city_id to improvement type #z: clicked from improv
   panel in the city list screen
**************************************************************************/
function change_city_prod_to(event, city_id, z)
{
  if (event) {
    if (event.shiftKey) {   //intercept shift-click and call the right function
      highlight_rows_by_improvement(z, false);
      return;
    } else if (event.ctrlKey) {
      select_rows_by_improvement(z, false);
      return;
    }
  }
  var pcity = cities[city_id];
  send_city_change(pcity['id'], VUT_IMPROVEMENT, z);
  set_mass_prod_city(pcity['id']); // default this prod selection for mass-selection 
  save_city_checkbox_states();
  retain_checkboxes_on_update = true;

  active_superpanel_dialog_refresh_delay = true; //wait for user input before reset
  active_superpanel_cityid = city_id; // keep panel up after refresh/update
}

/**************************************************************************
 Toggles highlighted city rows by improvement type #z: 
   shift-clicked from Super PAnel in the city list screen
**************************************************************************/
function highlight_rows_by_improvement(z, clear)
{ // clear==true means don't toggle, just clear them all
  for (var city_id in cities) {
    var pcity = cities[city_id]
    if (client.conn.playing != null && city_owner(pcity) != null && city_owner(pcity).playerno == client.conn.playing.playerno) {      
      // if city has improvement, toggle the highlighting:
      if (clear || city_has_building(pcity, z)) {
        if (clear || $("#cities_list_"+city_id).css("background-color") == "rgb(0, 0, 255)" ) {
          $("#cities_list_"+city_id).css({"background-color":"rgba(0, 0, 0, 0)"}); 
        } else $("#cities_list_"+city_id).css({"background-color":"rgb(0, 0, 255)"});  // TODO, insert a fake sort character to the name of the city?
      }
    }
  }
}
/**************************************************************************
 Toggles selection checkboxes in city rows by improvement type #z: 
   ctrl-clicked from Super PAnel in the city list screen
**************************************************************************/
function select_rows_by_improvement(z, clear)
{ // clear==true means don't toggle, just clear them all
  for (var city_id in cities) {
    var pcity = cities[city_id]
    if (client.conn.playing != null && city_owner(pcity) != null && city_owner(pcity).playerno == client.conn.playing.playerno) {      
      // if city has improvement, toggle the checkbox
      if (clear || city_has_building(pcity, z)) {
        if (clear || $("#cb"+city_id).prop("checked") == true ) {
          $("#cb"+city_id).prop("checked", false); 
        } else $("#cb"+city_id).prop("checked", true);  
      }
    }
  }
}

/**************************************************************************
 Updates the Cities tab when clicked, populating the table.
**************************************************************************/
function update_city_screen()
{
  if (observing) return;
  //console.log("----------------------")
  //console.log("Update city screen.")

  // start at default width
  $('#cities_scroll').css("width", "100%");

  // -------------------------------------------------------------------
  // Carefully set up display mode controls:  wide, reduced standard, tiny:
  var wide_screen = $(window).width()<1340 ? false : true;
  var narrow_screen = $(window).width()<1000 ? true : false;
  var small_screen = is_small_screen();
  var landscape_screen = $(window).width() > $(window).height() ? true : false; 
  var tiny_screen=false;
  var redux_screen=false;  // mid-size screen
  
  // narrow screen triggers tiny screen (becase we need width for city rows)
  // if small_screen and not landscape, that's also a tiny screen:
  if ( (small_screen) || (narrow_screen && !scroll_narrow_x)) {
    /* Exception: scroll_narrow_x is option for users wanting horiz-scroll for
     * more info. They get redux screen instead of tiny: */
    if (scroll_narrow_x) {
      tiny_screen = true; redux_screen=true; wide_screen = false;
      if (scroll_narrow_x && narrow_screen && !landscape_screen) $('#cities_scroll').css("width", "110%");
    } else {
      tiny_screen = true; redux_screen=false; wide_screen = false;
    }
  } else if (!wide_screen) {
      if (narrow_screen) {
        redux_screen=true; tiny_screen=true; wide_screen = false;
      }
      else {
        redux_screen=true; tiny_screen=false; wide_screen = false;
      }
  }
  /*
  console.log("Wide:   "+wide_screen);
  console.log("Landscp:"+landscape_screen);
  console.log("Redux:  "+redux_screen);
  console.log("Small:  "+small_screen);
  console.log("Narrow: "+narrow_screen);
  console.log("Tiny:   "+tiny_screen);
  console.log("Scrollx:"+scroll_narrow_x); */
  // -------------------------------------------------------------------

  var sortList = [];
  var headers = $('#city_table thead th');
  headers.filter('.tablesorter-headerAsc').each(function (i, cell) {
    sortList.push([cell.cellIndex, 0]);
  });
  headers.filter('.tablesorter-headerDesc').each(function (i, cell) {
    sortList.push([cell.cellIndex, 1]);
  });

  var citizen_types = ["unhappy","content","happy"]
  var sprite;
  var city_list_citizen_html = "";
  var updown_sort_arrows = "<img class='lowered_gov' src='data:image/gif;base64,R0lGODlhFQAJAIAAAP///////yH5BAEAAAEALAAAAAAVAAkAAAIXjI+AywnaYnhUMoqt3gZXPmVg94yJVQAAOw=='>";
  // Used for generating micro-icon of current prooduction:
  var prod_sprite;
  var prod_img_html;
  // Generate table header for happy,content,unhappy citizen icons:
  for (var i = 0; i < 3; i++) {
    sprite = get_specialist_image_sprite("citizen." + citizen_types[i] + "_1");
    city_list_citizen_html = "<th id='city_list_citizen_"+ citizen_types[i]+"' class='' style='padding-right:0px; margin-right:-3px;' title=''><div style='float:right; background: transparent url("
    + sprite['image-src'] + ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y'] + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px;'></div></th>" 
    + city_list_citizen_html
  }

  var city_list_html = "";
  if (wide_screen)  // fully standard deluxe wide-screen mode, include all info
  {
    //console.log("MODE: Widescreen")
    city_list_html = "<table class='tablesorter-dark' id='city_table' style='border=0px;border-spacing=0;padding=0;'>"
        + "<thead id='city_table_head'><tr>"
        + "<th style='text-align:right;'>Name"+updown_sort_arrows+"</th><th style='text-align:right;'>Size"+updown_sort_arrows+"</th>"+city_list_citizen_html
        + "<th style='text-align:right;' title='Text: Current state. Color: Next turn state'>State<img class='lowered_gov' src='data:image/gif;base64,R0lGODlhFQAJAIAAAP///////yH5BAEAAAEALAAAAAAVAAkAAAIXjI+AywnaYnhUMoqt3gZXPmVg94yJVQAAOw=='></img> </th>"
        + "<th id='food' title='Food surplus' class='food_text' style='text-align:right;padding-right:0px'><img style='margin-right:-6px; margin-top:-3px;' class='lowered_gov' src='/images/wheat.png'></th>"
        + "<th title='Production surplus (shields)' class='prod_text' style='text-align:right;padding-right:0px'> <img class='lowered_gov' src='/images/shield14x18.png'></th>"
        + "<th title='Trade' class='trade_text' style='text-align:right;padding-right:0px;'><img class='lowered_gov' src='/images/trade.png'></th>"
        + "<th>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</th>"
        + "<th title='Gold' class='gold_text' style='text-align:right;padding-right:0px;'><img class='lowered_gov' src='/images/gold.png'></th>"
        + "<th title='Luxury' class='lux_text' style='text-align:right;padding-right:0px'><img class='lowered_gov' src='/images/lux.png'></th>"
        + "<th title='Science (bulbs)' class='sci_text' style='text-align:right'><img class='lowered_gov' src='/images/sci.png'></th>"
        + "<th style='text-align:right;'>Grows In"+updown_sort_arrows+"</th><th style='text-align:right;'>Granary"
              +updown_sort_arrows+"</th><th style='text-align:right;' title='Click to change'>Producing"+updown_sort_arrows+"</th>"
        + "<th style='text-align:right;' title='Turns to finish &nbsp;&nbsp; Prod completed/needed'>Turns"+updown_sort_arrows
              +"&nbsp; Progress</th><th style='text-align:right;' title='Click to buy'>Cost"+updown_sort_arrows+"</th>"
        + "<th style='text-align:left;'><input type='checkbox' id='master_checkbox' title='Toggle all cities' name='cbAll' value='false' onclick='toggle_city_row_selections();'></th>"
        + "</tr></thead><tbody>";
  } else if (redux_screen) // semi-standard rendition of the above with minor trimming
  { // -1 column (selection box). Economised columns: Sort Arrows, Grows In>>Grows, Name of Production/Image >> Image only, Turns/Progress>>Progress
    //console.log("MODE: Reduced Standard")
    city_list_html = "<table class='tablesorter-dark' id='city_table' style='border=0px;border-spacing=0;padding=0;'>"
    + "<thead id='city_table_head'><tr>"
    + "<th style='text-align:right;'>Name"+"</th><th style='text-align:center;'>Pop"+"</th>"+city_list_citizen_html
    + "<th style='text-align:center;' title='Text: Current state. Color: Next turn state'>Mood</th>"
    + "<th id='food' title='Food surplus' class='food_text' style='text-align:right;padding-right:0px'><img style='margin-right:-6px; margin-top:-3px;' class='lowered_gov' src='/images/wheat.png'></th>"
    + "<th title='Production surplus (shields)' class='prod_text' style='text-align:right;padding-right:0px'> <img class='lowered_gov' src='/images/shield14x18.png'></th>"
    + "<th title='Trade' class='trade_text' style='text-align:right;padding-right:0px;'><img class='lowered_gov' src='/images/trade.png'></th>"
    + "<th>&nbsp;&nbsp;&nbsp;&nbsp;</th>"
    + "<th title='Gold' class='gold_text' style='text-align:right;padding-right:0px;'><img class='lowered_gov' src='/images/gold.png'></th>"
    + "<th title='Luxury' class='lux_text' style='text-align:right;padding-right:0px'><img class='lowered_gov' src='/images/lux.png'></th>"
    + "<th title='Science (bulbs)' class='sci_text' style='text-align:right'><img class='lowered_gov' src='/images/sci.png'></th>"
    /*+ "<th style='text-align:right;'>Grows"+"</th><th style='text-align:right;'>Grain"*/
    + ( (!tiny_screen) ? ("<th style='text-align:right;'>Grows"+"</th><th style='text-align:right;'>Grain")
                     : ("<th style='text-align:center;'>Grow"+"</th><th style='text-align:right;'>Food") )
     /* +"</th><th style='text-align:right;' title='Click to change'>Making"+"</th>" */
    + ( (!tiny_screen) ? ("</th><th style='text-align:right;' title='Click to change'>Making"+"</th>")
                       : ("</th><th style='text-align:right;'>Build"+"</th>" ) )
    + "<th style='text-align:right;' title='Turns to finish &nbsp;&nbsp; Prod completed/needed'>"
    /*+ "Progress</th><th style='padding-right:1em; text-align:right;' title='Click to buy'>Cost"+"</th>"*/
    + ( (!tiny_screen) ? ("Progress</th><th style='padding-right:1em; text-align:right;' title='Click to buy'>Cost"+"</th>")
                       : ("in</th><th style='padding-right:1em; text-align:right;'>Cost"+"</th>") )
    + ( (!tiny_screen) ? ("<th style='text-align:left;'><input type='checkbox' id='master_checkbox' title='Toggle all cities' name='cbAll' value='false' onclick='toggle_city_row_selections();'></th>")
                     : "" )   // skip checkbox column for tiny redux mode
    + "</tr></thead><tbody>";
  } else {  // tiny - brutally cut non-crucial info
    // -2 columns (selection box, cost). Economised: Sort arrows, Grows In>>grows, Granary>>Grain, Producing>>Output:Image only, Turns/Progress>>Turns
    //console.log("MODE: Small Narrow")
    city_list_html = "<table class='tablesorter-dark' id='city_table' style='border=0px;border-spacing=0;padding=0;'>"
    + "<thead id='city_table_head'><tr>"
    + "<th style='text-align:right;'>Name"+"</th><th style='text-align:center;'>Pop"+"</th>"+city_list_citizen_html
    + "<th style='text-align:center;' title='Text: Current state. Color: Next turn state'>Mood</th>"
    + "<th id='food' title='Food surplus' class='food_text' style='text-align:right;padding-right:0px'><img style='margin-right:-6px; margin-top:-3px;' class='lowered_gov' src='/images/wheat.png'></th>"
    + "<th title='Production surplus (shields)' class='prod_text' style='text-align:right;padding-right:0px'> <img class='lowered_gov' src='/images/shield14x18.png'></th>"
    + "<th title='Trade' class='trade_text' style='text-align:right;padding-right:0px;'><img class='lowered_gov' src='/images/trade.png'></th>"
    + "<th>&nbsp;&nbsp;&nbsp;</th>"
    + "<th title='Gold' class='gold_text' style='text-align:right;padding-right:0px;'><img class='lowered_gov' src='/images/gold.png'></th>"
    + "<th title='Luxury' class='lux_text' style='text-align:right;padding-right:0px'><img class='lowered_gov' src='/images/lux.png'></th>"
    + "<th title='Science (bulbs)' class='sci_text' style='text-align:right'><img class='lowered_gov' src='/images/sci.png'></th>"
    + "<th style='text-align:center;'>Grow"+"</th><th style='text-align:right;'>Food"
          +"</th><th style='text-align:right;' title='Click to change'>Build"+"</th>"
    + "<th style='text-align:right;' title='Turns to finish &nbsp;&nbsp; Prod completed/needed'>in</th>"
    + "</tr></thead><tbody>";
  }
        
  var count = 0;
  var happy_people, content_people, unhappy_angry_people;
  var city_name;
  var city_food, city_prod, city_trade;
  var city_gold, city_lux, city_sci; 
  var city_growth, city_food_stock;       // grows in x turns, how much is in grain storage
  var city_granary_size, city_buy_cost;   // grain needed to grow, cost to buy city's production
  var city_state; 
  var shield_cost;
  var adjust_oversize = "";               // for style-injecting margin/alignment adjustment on oversize city production images

  for (var city_id in cities){
     // shortcut for replacing <td> tags with clickable <td> tags that take to city dialogue:
    var pcity = cities[city_id]

    // TO DO, don't make these for cities that won't even show up in the list, put under the if statement below that checks ownership
    var td_hover_html = wide_screen
      ? "<td class='tdc1' style='padding-right:1em; text-align:right;' onmouseover='show_city_improvement_pane("+pcity['id']+");' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
      : "<td class='tdc1' style='padding-right:1em; text-align:right;' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>";
    var td_click_html = "<td class='tdc1' style='padding-right:1em; text-align:right;' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>";
    var td_click2_html = "<td class='tdc2' style='text-align:right;' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>";
    var td_buy_html =   "<td style='padding-right:1em; text-align:right;' onclick='javascript:request_city_id_buy("+ pcity['id'] + ");'>";
    var td_change_prod_html = "<td title='Click to change' style='text-align:right;' onclick='javascript:city_change_prod("+ pcity['id'] + ");'>";

    if (client.conn.playing != null && city_owner(pcity) != null && city_owner(pcity).playerno == client.conn.playing.playerno) {
      count++; 
      var prod_type = get_city_production_type(pcity);
      var turns_to_complete_str;
      var progress_string;          // accumulated shields/total shields needed

      // max city size of 40 generates numbers with 9 characters max, pad the string with 10 so the numbers align better:
     // var population_string = "<span class='number_element'>"+numberWithCommas(city_population(pcity)*1000)+"</span>";
      // max city size is 2 digits, so pad a space to create right alignment:
      var city_size_string = "";
      if (wide_screen)
        city_size_string = "<span class='mobile_centre non_priority'>"+pcity['size']+"</span>";
      else  city_size_string = "<span class='mobile_centre redux_centre non_priority'>" + pcity['size'] + "</span>";

      turns_to_complete = get_city_production_time(pcity);
      if (get_city_production_time(pcity) == FC_INFINITY) {
          turns_to_complete_str = "<span class='non_priority'>&nbsp;&nbsp; </span>";   //client does not know how long production will take yet.
        } else {
          if (wide_screen)
            turns_to_complete_str = "<span class='non_priority'>"+turns_to_complete+"</span>";
          else 
            turns_to_complete_str = "<span class='non_priority'>"+turns_to_complete+"</span>";
          // bold to indicate finishing at TC.  invisible tiny 0 at start is a sorting hack
          if (turns_to_complete == 1)
            turns_to_complete_str = (wide_screen) 
                                     ? "<span style='font-size:1%; color:rgba(0,0,0,0);'>0</span>"+"<b>next</b>"
                                     : "<span style='font-size:1%; color:rgba(0,0,0,0);'>0</span>"+"<b>1</b>";   
        }

        // construct coloured and formatted x/y shield progress string where x=shields invested and y=total shield cost:
        var purchase;
        var shields_invested = pcity['shield_stock'];
        if (pcity['production_kind'] == VUT_UTYPE) {
          purchase = unit_types[pcity['production_value']];
        } else if (pcity['production_kind'] == VUT_IMPROVEMENT) {
          purchase = improvements[pcity['production_value']];
        }
        if (purchase['name']=="Coinage") progress_string=" ";
        else {
          shields_invested = shields_invested.toString();
          // pad numbers <3 digits with one space for each missing digit, in order to align them:
          if (shields_invested.length<3)
              shields_invested = "&nbsp;&nbsp;".repeat(3-shields_invested.length) + shields_invested; 
            
          progress_string=shields_invested + "<span class='contrast_text'>/</span>";

          shield_cost = universal_build_shield_cost(pcity, purchase).toString();
          // pad numbers <3 digits with one space for each missing digit, in order to align them:
          if (shield_cost.length<3)
              shield_cost = "&nbsp;&nbsp;".repeat(3-shield_cost.length) + shield_cost; 

          progress_string="<span class='non_priority'>"+progress_string+shield_cost+"</span>"
        }
        
        happy_people   = pcity['ppl_happy'][FEELING_FINAL];
        content_people = pcity['ppl_content'][FEELING_FINAL];
        unhappy_angry_people = pcity['ppl_unhappy'][FEELING_FINAL]+pcity['ppl_angry'][FEELING_FINAL];
    
        // PEACE, CELEBRATING, OR DISORDER:
        city_state = get_city_state(pcity);
        if (tiny_screen) {
          switch (city_state) {
            case "Peace":
              city_state = "&#x262E;"; // peace
              break;
            case "Disorder":
              city_state = "&#x270A;"  // fist
              break;
            case "Celebrating": 
              city_state = "&#x1F388;";  // balloon
              break;
          }
        }
        city_state+="</span>";
     
        // Color code for upcoming state under current configuration of tiles/luxury rate/improvements/deployed units:
        if (happy_people >= pcity['size']*0.4999 && unhappy_angry_people==0 && pcity['size']>2)  
          city_state = "<span class='redux_centre mobile_centre hint_of_green' style='text-align:center;'>"+city_state;    // half or more happy, no unhappy = city will (continue to) celebrate, green code.
        else if (unhappy_angry_people > happy_people)                  
          city_state = "<span class='redux_centre mobile_centre negative_text' style='text-align:center;'>"+city_state;    // more unhappy than happy = disorder, red code
        else
          city_state = "<span class='redux_centre mobile_centre non_priority' style='text-align:center;'>"+city_state;     // state of peace is all other conditions = regular text 
         
        happy_people   = "<span class='hint_of_green'>"+happy_people+"</span>";
        content_people = "<span class='hint_of_blue'>" +content_people+"</span>";
        unhappy_angry_people = "<span class='hint_of_orange'>"+unhappy_angry_people+"</span>";  
   
        // FPT
        var food_check = pcity['surplus'][O_FOOD];
        if (food_check > 0) {
          city_food = "<td style='text-align:right;' class='food_text' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
          + "<span class='food_text'>" + pcity['surplus'][O_FOOD]+"</span>" + "</td>";
        } else if (food_check == 0) {
          city_food = "<td style='text-align:right;' class='food_text' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
          + " "+ "</td>";      // showing nothing is more informative to the eye than showing a numeral.
        } else if (food_check < 0) {
          city_food = "<td style='text-align:right;' class='negative_food_text' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
          + "<span class='negative_food_text'>" + pcity['surplus'][O_FOOD]+"</span>" + "</td>";
        }
        city_prod = "<td style='text-align:right;' class='prod_text' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
          + "<span class='prod_text'>" + pcity['surplus'][O_SHIELD]+"</span>" + "</td>";
        city_trade= "<td style='text-align:right;' class='trade_text' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
          + "<span class='trade_text'>" + pcity['surplus'][O_TRADE]+"</span>" + "</td>";
        
         // GLS
        city_gold= "<td style='text-align:right;' class='gold_text' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
          + "<span class='gold_text'>" + pcity['prod'][O_GOLD] +"</span>" +  "</td>"
        city_lux = "<td style='text-align:right;' class='lux_text' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
          + "<span class='lux_text'>" + pcity['prod'][O_LUXURY] +"</span>" +  "</td>";
        city_sci = "<td style='text-align:right;' class='sci_text' onclick='javascript:show_city_dialog_by_id(" + pcity['id'] + ");'>"
          + "<span class='sci_text'>" + pcity['prod'][O_SCIENCE] + "</span>" + "</td>";

        // Calculate turns to grow or " " if not growing
        if (tiny_screen) { // tiny screen, numerals only
          city_growth = pcity['granary_turns'];
          if (city_growth>1000) city_growth = " ";
          else if (city_growth != 1 && city_growth != -1) city_growth="<span class='mobile_centre non_priority'>" + city_growth + "</span>";
          else city_growth="<span class='mobile_centre'>" + city_growth + "</span>";
        } else { // (wide_screen || redux_screen) 
          city_growth = city_turns_to_growth_text(pcity);
          if (city_growth.startsWith("<b>")) {
            // keep bright white if Starving in 1 (which we know because it comes back with <b>)
          } else { 
            city_growth="<span class='non_priority'>" + city_growth + "</span>"; 
          }
        } 

        if (!wide_screen) {
          city_food_stock = "<span class='non_priority'>" + pcity['food_stock']+"</span>";   
          city_granary_size = "<span class='non_priority'>" + pcity['granary_size']+"</span>";   
        } else { // (wide_screen) 
          city_food_stock = "<span class='non_priority'>" + pcity['food_stock']+"</span>";   
          city_granary_size = pcity['granary_size'].toString();
          // insert a " " for every digit short of 3 digits, for alignment:
          if (city_granary_size.length<3)
            city_granary_size = "&nbsp;&nbsp;".repeat(3-city_granary_size.length) + city_granary_size;

          city_granary_size = "<span class='non_priority'>" + city_granary_size+"</span>";
        } 
        
        
        // Generate and align buy cost with link to buy, or blank if can't be bought because no shields remain.
        if (pcity['buy_cost'] == 0) {
          city_buy_cost = " ";   // blank is less visual noise than a 0.
        } else if (wide_screen) {
          city_buy_cost = "<u>"+pcity['buy_cost']+"</u>";
          city_buy_cost = "<div title='Click to buy' style='padding-right:10px;'>" + city_buy_cost + "</div>" // last column not forced to very edge of screen
        } else {
          city_buy_cost = "<u>"+pcity['buy_cost']+"</u>" 
          city_buy_cost = "<div style='text-align:right; title='Click to buy' style='padding-right:1em;'>" + city_buy_cost + "</div>" // last column not forced to very edge of screen
        }

        // Generate micro-sprite for production  
        prod_sprite = get_city_production_type_sprite(pcity);
        prod_img_html = "";
        if (prod_sprite != null) { 
          sprite = prod_sprite['sprite'];
          
          adjust_oversize = (sprite['width']>64) ? "margin-right:-20px;" : "";  // "oversize" images are 20 pixels wider so need alignment
          
          prod_img_html = "<div class='prod_img' oncontextmenu='set_mass_prod_city("+pcity['id']+");' title='Right-click sets mass-selection target' style='max-height:24px; float:right; padding-left:0px padding-right:0px; content-align:right; margin-top:-14px;"
                  + adjust_oversize+"'>"
                  + "<div style='float:right; content-align:right;"
                  + "background: transparent url("
                  + sprite['image-src']
                  + ");transform: scale(0.625); background-position:-" + sprite['tileset-x'] + "px -" + (sprite['tileset-y'])
                  + "px;  width: " + (sprite['width']) + "px;height: " + (sprite['height']) + "px;"
                  + " content-align: right;"
                  + "vertical-align:top; float:right;'>"
                  +"</div></div>";
        }   
        
        // tiny mobile: abbreviate city name to first 11 letters plus small "..."
        city_name = ( (tiny_screen && pcity['name'].length>11) 
              ? (pcity['name'].substring(0,10) + "<span style='font-size:66%;'>&#x22ef;</span></td>") 
              : (pcity['name'] + "</td>") );
        
        city_list_html += "<tr class='cities_row' id='cities_list_" + pcity['id'] + "'>"
                + td_hover_html + city_name + "</td>" // tiny mobile: abbreviate city name to first 11 letters plus "..."
                + td_click_html + city_size_string + "</td>"
                + td_click2_html + happy_people+"</td>"
                + td_click2_html + content_people+"</td>"
                + td_click2_html + unhappy_angry_people+"</td>"
                + td_click_html + city_state + "</td>"
                + city_food + city_prod + city_trade
                + td_click_html + "</td>"
                + city_gold + city_lux + city_sci
                + td_click_html + city_growth + "</td>"
                + td_click_html+ city_food_stock + "<span class='contrast_text'>/</span>" + city_granary_size + "</td>"
                + td_change_prod_html +
                      (  wide_screen  ? ("&nbsp;&nbsp;<u>"+prod_type['name']+"</u> "+prod_img_html+"</td>") 
                                      : ("<span style='font-size:1%; color: rgba(0, 0, 0, 0);'>"+prod_type['name'].charAt(0)+"</span>"+prod_img_html+"</td>") ) //invisible tiny first letter for column sorting
                + td_click_html + 
                      (   wide_screen ? (turns_to_complete_str+" &nbsp;&nbsp;&nbsp;&nbsp; "+progress_string +"</td>")
                                      : (redux_screen && !tiny_screen ? "("+turns_to_complete_str+") "+progress_string+"</td>" 
                                                      : turns_to_complete_str.replace("turns", "")+"</td>")   )     
                + ( (wide_screen || redux_screen) ? (td_buy_html+city_buy_cost+"</td>") : "" )
                + ( !tiny_screen 
                    ? "<td style='text-align:left;'><input type='checkbox' oncontextmenu='set_mass_prod_city("+pcity['id']+");' id='cb"+pcity['id']+"' value=''></td>"          
                    : "" )
        city_list_html += "</tr>";
    }
  }

  // Title Header Area:
  var title_text = "<span style='text-align:left; float:left; padding-right:10px;'>Your Cities ("+count+")</span>";
  if (!is_small_screen() ) {
    title_text +=
       " <span id='city_improvements_hover_list'></span>"
     + " <span id='mass_production'></span>"    // mass-select functionality not available on mobile
     + " <button title='Change production in selected cities' class='button ui-button ui-corner-all ui-widget' style='padding:5px; margin:4px; font-size:70%; float:right;' onclick='mass_change_prod();'>Change &#x2611; to:</button>"
     + " <button title='BUY in selected cities' class='button ui-button ui-corner-all ui-widget' style='padding:5px; margin:4px; font-size:70%; float:right;' onclick='buy_all_selected_cities();'>&#x2611; Buy selected</button>";
  } else $('#cities_title').css({"font-size":"100%"}); 
  $('#cities_title').html(title_text); 
  
  city_list_html += "</tbody></table>";
  $("#cities_list").html(city_list_html);
  
  //$('#city_list_citizen_unhappy').css("padding-right", "20px");
  $('#city_list_citizen_unhappy').tooltip({content: "Unhappy + angry citizens", position: { my:"center bottom", at: "center top+10"}});
  $('#city_list_citizen_content').tooltip({content: "Content citizens", position: { my:"center bottom", at: "center top+10"}});
  $('#city_list_citizen_happy').tooltip({content: "Happy citizens", position: { my:"center bottom", at: "center top+10"}});

  if (count == 0) {
    $("#city_table").html("You have no cities. Build new cities with the Settlers unit.");
  }

  $('#cities_scroll').css("height", $(window).height() - 200);

  $("#city_table").tablesorter({theme:"dark", sortList: sortList});

  if (tiny_screen) {
    $("#city_table").css({"zoom":"0.6", "-moz-transform":"0.6"});  // -40% scaling if screen is small AND narrow
    $("#city_table_head").css({"font-size":"85%"});  
    $(".prod_img").css({"margin-top":"-19px"});  
    $(".tdc1").css({"padding-right":"0px"});  
    $(".tdc2").css({"padding-right":"0px"});
    $(".mobile_centre").parent().css({"text-align":"center"});
    $(".mobile_centre").css({"text-align":"center"});
  }
  else if (redux_screen) {
    $("#city_table").css({"zoom":"0.91", "-moz-transform":"0.91"});  // -9% scaling if screen is only slightly smaller
    $("#city_table_head").css({"font-size":"95%"});  
    $(".tdc1").css({"padding-right":"0px"});  
    $(".tdc2").css({"padding-right":"0px"}); 
    $(".redux_centre").parent().css({"text-align":"center"});
    $(".redux_centre").css({"text-align":"center"}); 
  } else if (wide_screen) {
  }

  if (retain_checkboxes_on_update)
  {
    retain_checkboxes_on_update = false;
    restore_city_checkboxes();
  }
  // Update display for current mass production selection:
  set_mass_prod_city(prod_selection_city);

  // Update an active SuperPanel if we had a refresh of screen after a 
  // SuperPanel action:
  if (active_superpanel_cityid > 0) {
    show_city_improvement_pane(active_superpanel_cityid);
    if (active_superpanel_dialog_refresh_delay==true)
      // Don't reset state the first time if waiting for user input.
      // By the time the next refresh comes, user will have answered 
      // a dialog question (such as whether to buy/sell a building)
      active_superpanel_dialog_refresh_delay = false;
    else  
      active_superpanel_cityid = -1; // deactive refresh mode.
  }
}

/**************************************************************************
  Restores retained checkbox states if update_city_screen() refreshes
  itself while viewing (e.g., bought something, changed production item)
**************************************************************************/
function restore_city_checkboxes()
{
  //console.log("Restoring checkboxes.");
  // Restore checkbox state in individual city rows:
  if (city_checkbox_states != null) {
    for (var city_id in cities)  {
      if (city_checkbox_states[city_id] == true) {
        //console.log("  "+city_id+":"+cities[city_id].name+" == true.  (setting now)");
        $("#cb"+city_id).prop('checked', true);
      } 
    }
  }
  // Restore checkbox state of "master" header checkbox
  $("#master_checkbox").prop('checked', master_checkbox);
}

/**************************************************************************
  Save all checkboxes in city list for restoring if screen updates.
**************************************************************************/
function save_city_checkbox_states()
{
  for (var city_id in cities)  {
    if ($("#cb"+city_id).is(":checked")) {
      city_checkbox_states[city_id] = true;
    } else city_checkbox_states[city_id] = false;
  }
}

/**************************************************************************
  Toggle all checkboxes in city list for selecting cities
**************************************************************************/
function toggle_city_row_selections()
{
  for (var city_id in cities)  {
    $("#cb"+city_id).prop('checked', !($("#cb"+city_id).is(":checked")) );
  }
  master_checkbox = $("#master_checkbox").is(":checked");
}

/**************************************************************************
  Buys (or attempts to buy) every production item in every selected city.
**************************************************************************/
function buy_all_selected_cities()
{
  for (var city_id in cities)  {
    if ($("#cb"+city_id).is(":checked")) {
      var packet = {"pid" : packet_city_buy, "city_id" : cities[city_id].id};
      send_request(JSON.stringify(packet));
      city_checkbox_states[city_id] = true;
    } else city_checkbox_states[city_id] = false;
  }
  retain_checkboxes_on_update = true;
}

/*************************************************************************
  Changes production in all cities to be same as the selected city
**************************************************************************/
function mass_change_prod()
{
  //console.log("  mass_change_prod() called")
  var c = prod_selection_city;  // the city to model for what all others should produce
  for (var city_id in cities)  {
    if ($("#cb"+city_id).is(":checked")) {     
      send_city_change(cities[city_id].id, cities[c].production_kind,cities[c].production_value);
      city_checkbox_states[city_id] = true;
    } else city_checkbox_states[city_id] = false;
  }  
  retain_checkboxes_on_update = true;
}

/*************************************************************************
  Sets prod_selection_city - this records which city's production
  selection will be the "model" if the user does a mass-selection
  production change
**************************************************************************/
function set_mass_prod_city(city_id)
{
  //console.log("  set_mass_prod_city() called")
  prod_selection_city = city_id;
  pcity = cities[city_id];
  var prod_type = get_city_production_type_sprite(pcity);
  var prod_img_html = "";
  if (prod_type != null) { 
    sprite = prod_type['sprite'];
    prod_img_html = "<span title='" + (prod_type!=null ? "Selected cities will change production to: "+prod_type['type']['name'] : "") + "' style='background: transparent url("
           + sprite['image-src']
           + ");background-position:-" + sprite['tileset-x'] + "px -" + sprite['tileset-y']
           + "px;  width: " + sprite['width'] + "px;height: " + sprite['height'] + "px; float:right; transform:scale(0.7); cursor:pointer;' "
           + "onclick='javascript:city_change_prod("+ pcity['id'] + ");'"
           + ">"
           +"</span>";
  }
  $("#mass_production").html(prod_img_html);
}

/**************************************************************************
  Return TRUE iff the city is unhappy.  An unhappy city will fall
  into disorder soon.
**************************************************************************/
function city_unhappy(pcity)
{
  return (pcity['ppl_happy'][FEELING_FINAL]
          < pcity['ppl_unhappy'][FEELING_FINAL]
            + 2 * pcity['ppl_angry'][FEELING_FINAL]);
}

/**************************************************************************
 Returns the city state: Celebrating, Disorder or Peace.
**************************************************************************/
function get_city_state(pcity) 
{
  if (pcity == null) return;

  if (pcity['was_happy'] && pcity['size'] >= 3) {
    return "Celebrating";
  } else if (pcity['unhappy']) {
    return "Disorder";
  } else {
    return "Peace";
  }
}

/**************************************************************************
 Callback to handle keyboard events for the city dialog.
**************************************************************************/
function city_keyboard_listener(ev)
{
  // Check if focus is in chat field, where these keyboard events are ignored.
  if ($('input:focus').length > 0 || !keyboard_input) return;

  if (C_S_RUNNING != client_state()) return;

  /* if (!ev) ev = window.event; INTERNET EXPLORER DEPRECATED */
  var keyboard_key = String.fromCharCode(ev.keyCode);
  var key_code = ev.keyCode;

  if (active_city != null) {
    switch (key_code) {
      case 38: // 8/up arrow
      case 104:
        ev.stopImmediatePropagation();
        setTimeout(function(){  
          city_tab_index = 0;  // Main view screen
          $("#city_tabs").tabs({ active: city_tab_index});
        }, 300);
        break;
      case 40: // 2/down arrow
      case 98:
        ev.stopImmediatePropagation();
        setTimeout(function(){  
          city_tab_index = 1;  // Production screen
          $("#city_tabs").tabs({ active: city_tab_index});
        }, 300);
        break;
      case 27:
          ev.stopPropagation();
          close_city_dialog();
          chatbox_scroll_to_bottom(false);
          break;
      case 32:
          ev.stopPropagation();
          // SPACE - flip-flop between production/main screen
          // if not in one of those 2 screens, go to main screen
          if (city_tab_index > 1) city_tab_index = 0;
          else city_tab_index = 1-city_tab_index;  // flip production/main screen
          $("#city_tabs").tabs({ active: city_tab_index});
          break;
        }
    switch (keyboard_key) {
       case 'P':
         ev.stopPropagation();
         previous_city();
         break;

       case 'V':
       case 'M':
          ev.stopPropagation();
          city_tab_index = 0;  // Main screen / View
          $("#city_tabs").tabs({ active: city_tab_index});
          break;
    
       case 'Q':
         ev.stopPropagation();
         city_tab_index = 1;  // Production screen
         $("#city_tabs").tabs({ active: city_tab_index});
         break;

       case 'T':
       case 'R':
          ev.stopPropagation();
          city_tab_index = 2;  // Trade routes
          $("#city_tabs").tabs({ active: city_tab_index});
          break;
       
       case 'O':
          ev.stopPropagation();
          city_tab_index = 3;  // Options/Settings
          $("#city_tabs").tabs({ active: city_tab_index});
          break;

       case 'W': // same command as ESC above (code 27)
         ev.stopPropagation();
         close_city_dialog_trigger();
         chatbox_scroll_to_bottom(false);
         break;

       case 'N':
          ev.stopPropagation();
          next_city();
         break;

       case 'B':
          ev.stopPropagation();
          request_city_buy();
         break;
    }
  }
}

/**************************************************************************
 Returns the 3d model name for the given city.
**************************************************************************/
function city_to_3d_model_name(pcity)
{
  var size = 0;
  if (pcity['size'] >=3 && pcity['size'] <=6) {
    size = 1;
  } else if (pcity['size'] > 6 && pcity['size'] <= 9) {
    size = 2;
  } else if (pcity['size'] > 9 && pcity['size'] <= 11) {
    size = 3;
  } else if (pcity['size'] > 11) {
    size = 4;
  }

  var style_id = pcity['style'];
  if (style_id == -1) style_id = 0;
  var city_rule = city_rules[style_id];

  var city_style_name = "european";
  if (city_rule['rule_name'] == "Industrial" || city_rule['rule_name'] == "ElectricAge" || city_rule['rule_name'] == "Modern"
      || city_rule['rule_name'] == "PostModern" || city_rule['rule_name'] == "Asian") {
    city_style_name = "modern"
  }

  return "city_" + city_style_name + "_" + size;
}

/**************************************************************************
 Returns the city walls scale of for the given city.
**************************************************************************/
function get_citywalls_scale(pcity)
{
  var scale = 8;
  if (pcity['size'] >=3 && pcity['size'] <=6) {
    scale = 9;
  } else if (pcity['size'] > 6 && pcity['size'] <= 9) {
    scale = 10;
  } else if (pcity['size'] > 9 && pcity['size'] <= 11) {
    scale = 11;
  } else if (pcity['size'] > 11) {
    scale = 12;
  }

  return scale;
}
