/*global angular,_,moment */

/**
 * @ngdoc controller
 * @name TatUi.controller:MessagesMonitoringViewListCtrl
 * @requires TatUi.TatEngineMessagesRsc Tat Engine Resource Messages
 * @requires TatUi.TatEngine            Global Tat Engine service
 *
 * @description List Messages controller
 */
angular.module('TatUi')
  .controller('MessagesMonitoringViewListCtrl', function(
    $scope,
    $rootScope,
    $stateParams,
    $interval,
    $cookieStore,
    Authentication,
    TatEngineMessagesRsc,
    TatEngine,
    TatTopic,
    TatFilter
  ) {
    'use strict';

    var self = this;
    self.filter = TatFilter.getCurrent();
    self.topic = $stateParams.topic;
    self.filterDialog = { x: 380, y: 62, visible: false };

    this.data = {
      messages: [],
      requestFrequency: 10000,
      count: 2000,
      skip: 0,
      isTopicDeletableMsg: false,
      isTopicDeletableAllMsg: false,
      isTopicUpdatableMsg: false,
      isTopicUpdatableAllMsg: false,
      isTopicRw: true,
      displayMore: true,
      stacked: [],
      nbUP: 0,
      nbAL: 0,
      nbOther: 0,
      initialLoading: false
    };

    $scope.$on('filter-changed', function(ev, filter){
      self.data.skip = 0;
      self.data.displayMore = true;
      self.filter = angular.extend(self.filter, filter);
      self.refresh();
    });

    this.filterSearch = function() {
      $rootScope.$broadcast('filter-changed', self.filter);
    }

    /**
     * @ngdoc function
     * @name loadMore
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Try to load more messages
     */
    self.loadMore = function() {
      if (!self.loading) {
        self.moreMessage();
      }
    };

    this.isMonitoring = function(message) {
      if (message.tags && message.tags.length >= 3) {
          if ((message.tags[0] === 'monitoring') &&
            (message.tags[2].indexOf('item:') === 0)) {
          return true;
        }
      }
      return false;
    };

    this.computeStatus = function(message) {
      if (message.labels) {
        for (var i = 0; i < message.labels.length; i++) {
          var l = message.labels[i];
          if (l.text === 'AL' || l.text === 'open') {
            message.statusText = 'AL';
            message.statusCss = 'btn-danger';
            return;
          } else if (l.text === 'UP' || l.text === 'done') {
            message.statusText = 'UP';
            message.statusCss = 'btn-success';
            return;
          }
        }
      }
      message.statusCss = 'btn-warning';
      message.statusText = 'WARN';
    }

    self.getItem = function(message) {
      if (self.isMonitoring(message)) {
        //len item: == 5
        return message.tags[2].substring(5, message.tags[2].length);
      }
    };

    self.getService = function(message) {
      if (self.isMonitoring(message)) {
        return message.tags[1];
      }
    };

    self.getBrightness = function(rgb) {
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(rgb);
      return result ?
        0.2126 * parseInt(result[1], 16) +
        0.7152 * parseInt(result[2], 16) +
        0.0722 * parseInt(result[3], 16) : 0;
    };

    /**
     * @ngdoc function
     * @name mergeMessages
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Merge messages in the current message list
     * @param {string} messages Message list to merge
     */
    self.mergeMessages = function(dest, source) {
      if (source && _.isArray(source)) {
        for (var i = 0; i < source.length; i++) {
          var origin = _.find(dest, {
            _id: source[i]._id
          });
          if (origin) {
            if (!origin.replies) {
              origin.replies = [];
            }
            self.mergeMessages(origin.replies, source[i].replies);
            origin.labels = source[i].labels;
            origin.likers = source[i].likers;
            origin.nbLikes = source[i].nbLikes;
            origin.nbReplies = source[i].nbReplies;
            origin.tags = source[i].tags;
          } else {
            if (!self.data.intervalTimeStamp) {
              self.data.intervalTimeStamp = source[i].dateUpdate;
            } else if (source[i].dateUpdate > self.data.intervalTimeStamp) {
              self.data.intervalTimeStamp = source[i].dateUpdate;
            }
            dest.push(source[i]);
          }
        }
      }
      TatFilter.sortMessages(dest);
      return dest;
    };

    /**
     * @ngdoc function
     * @name beginTimer
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Launch the timer to request messages at regular time interval
     */
    self.beginTimer = function() {
      self.data = angular.extend(self.data, TatTopic.getDataTopic());
      var timeInterval = self.data.requestFrequency;
      if ('undefined' === typeof self.data.timer) {
        self.getNewMessages(); // Don't wait to execute first call
        self.data.timer = $interval(self.getNewMessages, timeInterval);
        $scope.$on("$destroy", function() { self.stopTimer(); });
      }
    };

    /**
     * @ngdoc function
     * @name stopTimer
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Stop the time that request messages at regular time interval
     */
    self.stopTimer = function() {
      $interval.cancel(self.data.timer);
      self.data.timer = undefined;
    };

    /**
     * @ngdoc function
     * @name buildFilter
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Build a filter to read messages
     * @param {object} data Custom data to send to the API
     * @return {object} Parameters to pass to the API
     */
    self.buildFilter = function(data) {
      return angular.extend({}, data, self.filter);
    }

    /**
     * @ngdoc function
     * @name getNewMessages
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Request for new messages
     */
    self.getNewMessages = function() {
      if (self.loading) {
        console.log("messages list already in refresh...");
        return;
      }
      self.loading = true;
      var filter = self.buildFilter({
        topic: self.topic,
        onlyMsgRoot: true,
        limit: self.data.count,
        skip: 0
      });
      return TatEngineMessagesRsc.list(filter).$promise.then(function(data) {
        self.digestInformations(data);
      }, function(err) {
        TatEngine.displayReturn(err);
        self.loading = false;
      });
    };

    /**
     * @ngdoc function
     * @name moreMessage
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Request more messages
     * @return {object} Promise
     */
    self.moreMessage = function() {
      self.loading = true;
      var filter = self.buildFilter({
        topic: self.topic,
        onlyMsgRoot: true,
        limit: self.data.count,
        skip: self.data.skip
      });
      return TatEngineMessagesRsc.list(filter).$promise.then(function(data) {
        if (!data.messages) {
          self.data.displayMore = false;
        } else {
          self.data.skip = self.data.skip + self.data.count;
          self.digestInformations(data);
        }
      }, function(err) {
        TatEngine.displayReturn(err);
        self.loading = false;
      });
    };

    /**
     * @ngdoc function
     * @name digestInformations
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description
     * @return
     */
    self.digestInformations = function(data) {
      self.data.isTopicRw = data.isTopicRw;
      if (_.includes(Authentication.getIdentity().favoritesTopics, '/' + self.topic)) {
        self.data.isFavoriteTopic = true;
      }
      self.data.messages = self.mergeMessages(self.data.messages, data.messages);
      self.computeStack();
      self.loading = false;
      self.data.initialLoading = false;
    };


    self.computeStack = function() {
      var nbTotal = self.data.messages.length;
      self.data.nbUP = 0;
      self.data.nbAL = 0;
      self.data.nbOther = 0;

      if (nbTotal == 0) {
        return;
      }

      for (var i = 0; i < nbTotal; i++) {
        this.computeStatus(self.data.messages[i]);
        if (self.data.messages[i].statusText === 'AL') {
          self.data.nbAL++;
        } else if (self.data.messages[i].statusText === 'UP') {
          self.data.nbUP++;
        } else {
          self.data.nbOther++;
        }
      }

      self.data.stacked = [];
      self.data.stacked.push({
        value: (self.data.nbAL * 100 / nbTotal).toFixed(2),
        type: 'danger'
      });

      self.data.stacked.push({
        value: (self.data.nbUP * 100 / nbTotal).toFixed(2),
        type: 'success'
      });

      self.data.stacked.push({
        value: (self.data.nbOther * 100 / nbTotal).toFixed(2),
        type: 'warning'
      });
    };

    /**
     * @ngdoc function
     * @name init
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Initialize list messages page. Get list of messages from Tat Engine
     */
    self.init = function() {
      self.data.initialLoading = true;
      if (!angular.isDefined($cookieStore.get("showSidebar")) || $cookieStore.get("showSidebar") == true) {
        $rootScope.$broadcast("sidebar-toggle");
      }
      TatTopic.computeTopic(self.topic, self.beginTimer);
    };

    /**
     * @ngdoc function
     * @name refresh
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Refresh all the messages
     */
    self.refresh = function() {
      self.data.currentTimestamp = Math.ceil(new Date().getTime() / 1000);
      self.data.messages = [];
      self.moreMessage();
    };

    self.setMessage = function(message) {
      message.displayed = true;
      $scope.message = message;
    };

    self.toggleMessage = function(message) {
      var same = false;
      if ($scope.message && $scope.message._id == message._id) {
        same = true;
      }
      if ($scope.message && $scope.message.displayed) {
        self.closeMessage($scope.message);
        setTimeout(function() {
          $scope.$apply(function() {
            if (!same) {
              self.setMessage(message);
            }
          });
        }, 100);
      } else {
        self.setMessage(message);
      }
    };

    self.closeMessage = function(message) {
      $scope.message.displayed = false;
      $scope.message = null;
    };

    self.init();
  });
