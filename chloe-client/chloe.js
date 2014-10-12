/*   Copyright (C) 2013-2014 Computer Sciences Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License. */

window.chloe = (function() {

  var chloe = {
    init: function(app, channel, chloeUri, callback) {
      var ws = new WebSocket(chloeUri);
      // Web socket is closed if no data is sent within 60 seconds, so we're sending the server a ping
      // every 55 seconds to keep the web socket alive
      if (ws) {
        setInterval(function() {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ status: "keep-alive" }));
          } else if (ws.readyState === 2 || ws.readyState === 3) {
            // If the web socket is closed or closing, reopen it
            var onopen = ws.onopen;
            var onmessage = ws.onmessage;
            var onclose = ws.onclose;
            var onerror = ws.onerror;
            ws = new WebSocket(chloeUri);
            ws.open = onopen;
            ws.onmessage = onmessage;
            ws.onclose = onclose;
            ws.onerror = onerror;
          }
        }, 55000);
      }
      ws.onopen = function() {
        if (channel) {
          ws.send(JSON.stringify({ app: app, channel: channel }));
        }   
      };
      ws.onmessage = function(message) {
        message = JSON.parse(message.data);
        if (callback) {
          callback(message);
        }
      };
      ws.onclose = function(e) {
        console.log("Websocket closed: ");
        console.log(e);
      };
      ws.onerror = function(e) {
        console.log("Websocket error: ");
        console.log(e);
      };
    }
  };

  return chloe;
}());
