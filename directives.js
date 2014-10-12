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

'use strict';

/* Directives */
angular.module('BarryWidget.directives', []).
  directive('dropX', function($compile) {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        scope.menuvisible = false;
        var template = element.find('.drop-x-template');
        template.remove();
        template = template.children().remove();
        $compile(template)(scope);
        $('body').append(template);
        element.draggable({
          cursor: 'crosshair',
          distance: 20
        }).click(function(event) {
          template.css({left:event.pageX,top:event.pageY});
          scope.$apply(scope.menuvisible = !scope.menuvisible)
        });
      }
    }
  }).
  directive('draggable', function() {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        element.draggable({
          cursor: 'crosshair'
        });
      }
    }
  }).
  directive('droppable', function() {
    return {
      restrict: 'A',
      link: function(scope, element, attrs) {
        var afterDrop = scope.$eval(attrs['droppable']);
        if (!afterDrop) {
          afterDrop = function() {
            console.log(element.html() + " has no afterDrop function.");
          };
        }
        element.droppable({
          hoverClass: 'hover',
          drop: function(event,ui) {
            afterDrop(element, ui.draggable);
          }
        });
      }
    }
  });