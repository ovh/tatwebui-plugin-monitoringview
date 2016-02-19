/*global angular */

/**
 * @ngdoc directive
 * @name TatUi.directive:messagesItem
 * @restrict AE
 * @description
 * display a route message
 */
angular.module('TatUi').directive('messagesMonitoringviewItem', function(
  $compile) {
  'use strict';

  return {
    restrict: 'E',
    scope: {
      message: '=',
      topic: '=',
      isTopicDeletableMsg: '=',
      isTopicUpdatableMsg: '=',
      isTopicDeletableAllMsg: '=',
      isTopicUpdatableAllMsg: '=',
      isTopicRw: '='
    },
    replace: true,
    templateUrl: '../build/tatwebui-plugin-monitoringview/monitoringview/list/monitoringview-item.directive.html',
    controllerAs: 'ctrl',
    /**
     * @ngdoc controller
     * @name TatUi.controller:messagesItem
     * @requires TatUi.Authentication       Tat Authentication
     * @requires TatUi.TatEngineMessageRsc  Tat Engine Resource Message
     * @requires TatUi.TatEngine            Global Tat Engine service
     *
     * @description Directive controller
     */
    controller: function($scope, $rootScope, TatEngineMessagesRsc,
      TatEngineMessageRsc, TatEngine, Authentication, TatMessage ) {
      var self = this;
      this.answerPanel = false;
      self.setInToDoneText = "";
      this.getBrightness = function(rgb) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(rgb);
        return result ?
          0.2126 * parseInt(result[1], 16) +
          0.7152 * parseInt(result[2], 16) +
          0.0722 * parseInt(result[3], 16) : 0;
      };

      /**
       * @ngdoc function
       * @name replyMessage
       * @methodOf TatUi.controller:messagesItem
       * @description Reply to a message
       */
      this.replyMessage = function(message) {
        $scope.replying = false;
        TatEngineMessageRsc.create({
          'topic': $scope.topic.topic.indexOf("/") === 0 ? $scope.topic.topic.substr(1) : $scope.topic.topic,
          'idReference': message._id,
          'text': self.replyText
        }).$promise.then(function(resp) {
          self.replyText = "";
          if (!message.replies) {
            message.replies = [];
          }
          message.replies.unshift(resp.message);
        }, function(resp) {
          $scope.replying = true;
          TatEngine.displayReturn(resp);
        });
      };

      this.getText = function() {
        return $scope.message.text;
      };

      /**
       * @ngdoc function
       * @name deleteMessage
       * @methodOf TatUi.controller:messagesItem
       * @description delete a message from a Private topic
       */
      this.deleteMessage = function(message) {
        TatEngineMessagesRsc.delete({
          'idMessageToDelete': message._id,
          'cascade': 'cascade/'
        }).$promise.then(function(resp) {
          TatEngine.displayReturn(resp);
          message.hide = true;
        }, function(response) {
          TatEngine.displayReturn(response);
        });
      };

      /**
       * @ngdoc function
       * @name updateMessage
       * @methodOf TatUi.controller:messagesItem
       * @description Update a message
       */
      this.updateMessage = function(message) {
        message.updating = false;
        TatEngineMessageRsc.update({
          'topic': $scope.topic.topic.indexOf("/") === 0 ? $scope.topic.topic.substr(1) : $scope.topic.topic,
          'idReference': message._id,
          'text': message.text,
          'action': 'update',
        }).$promise.then(function(resp) {
          message.text = resp.message.text;
        }, function(resp) {
          message.updating = true;
          TatEngine.displayReturn(resp);
        });
      };

      /**
       * @ngdoc function
       * @name removeLabel
       * @methodOf TatUi.controller:messagesItem
       * @description remove a label
       * @param {object} message Message on which to add a label
       * @param {object} label   Label {text} to remove
       */
      this.removeLabel = function(message, labelText) {
        if (!message.labels) {
          return;
        }
        var toRefresh = false;
        var newList = [];
        for (var i = 0; i < message.labels.length; i++) {
          var l = message.labels[i];
          if (l.text === labelText ||  
            (labelText === 'doing' && l.text.indexOf('doing:') === 0)) {
            toRefresh = true;
            TatEngineMessageRsc.update({
              'action': 'unlabel',
              'topic': $scope.topic.topic.indexOf("/") === 0 ? $scope.topic.topic.substr(1) : $scope.topic.topic,
              'idReference': $scope.message._id,
              'text': l.text
            }).$promise.then(function(resp) {
              //nothing here
            }, function(resp) {
              TatEngine.displayReturn(resp);
            });
          } else {
            newList.push(l);
          }
        }

        if (toRefresh)  {
          message.labels = newList;
        }
      };

      this.urlMessage = function(message) {
        $rootScope.$broadcast('topic-change', {
          topic: $scope.topic.topic.indexOf("/") === 0 ? $scope.topic.topic.substr(1) : $scope.topic.topic,
          idMessage: message._id,
          reload: true
        });
      };

      this.init = function(message) {
        message.loading = true;
        return TatEngineMessagesRsc.list({
          topic: $scope.topic.topic.indexOf("/") === 0 ? $scope.topic.topic.substr(1) : $scope.topic.topic,
          treeView: "onetree",
          idMessage: message._id,
          limit: 1,
          skip: 0
        }).$promise.then(function(data) {
          if (!data.messages || data.messages.length != 1) {
            TatEngine.displayReturn("invalid return while getting message");
          } else {
            message.replies = data.messages[0].replies;
          }
          message.loading = false;
          message.limitTo = 10;
          if (message.replies && message.replies.length < 10) {
            message.limitTo = message.replies.length;
          }
        }, function(err) {
          TatEngine.displayReturn(err);
          message.loading = false;
        });

      };

      this.init($scope.message);

    }
  };
});
