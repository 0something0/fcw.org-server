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

/****************************************************************************
 ...
****************************************************************************/
function clone(obj){
  if(obj == null || typeof(obj) != 'object') {
    return obj;
  }
  var temp = obj.constructor(); // changed

  for (var key in obj) {
    temp[key] = clone(obj[key]);
  }

  return temp;
}


/*
 * DIVIDE() divides and rounds down, rather than just divides and
 * rounds toward 0.  It is assumed that the divisor is positive.
 */
function DIVIDE (n, d) {
  return parseInt( (n) / (d) - (( (n) < 0 && (n) % (d) < 0 ) ? 1 : 0) );
}

/****************************************************************************
 ...
****************************************************************************/
function FC_WRAP(value, range)
{
    return ((value) < 0
     ? ((value) % (range) != 0 ? (value) % (range) + (range) : 0)
     : ((value) >= (range) ? (value) % (range) : (value)));
}

/****************************************************************************
 ...
****************************************************************************/
function XOR(a,b) {
  return ( a || b ) && !( a && b );
}

/****************************************************************************
 ...
****************************************************************************/
$.extend({
  getUrlVars: function(){
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
      hash = hashes[i].split('=');
      vars.push(hash[0]);
      vars[hash[0]] = hash[1];
    }
    return vars;
  },
  getUrlVar: function(name){
    return $.getUrlVars()[name];
  }
});



var benchmark_start = 0;

/****************************************************************************
 Benchmark the Freeciv.net webclient.
****************************************************************************/
function civclient_benchmark(frame)
{

  if (frame == 0) benchmark_start = new Date().getTime();


  var ptile = map_pos_to_tile(frame+5, frame+5)
  center_tile_mapcanvas(ptile);

  if (frame < 30) {
    setTimeout("civclient_benchmark(" + (frame + 1) + ");", 10);
  } else {

    var end = new Date().getTime();
    var time = (end - benchmark_start) / 25;
    swal('Redraw time: ' + time);
  }
}

/****************************************************************************
 ...
****************************************************************************/
function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**************************************************************************
...
**************************************************************************/
function to_title_case(str)
{
  return str.replace(/\w\S*/g,
         function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

/**************************************************************************
...
**************************************************************************/
function get_random_int(min, max) {
  return Math.floor(fc_seedrandom() * (max - min)) + min;
}

/**************************************************************************
...
**************************************************************************/
function supports_mp3() {
  var a = document.createElement('audio');
  return !!(a.canPlayType && a.canPlayType('audio/mpeg;').replace(/no/, ''));
}
