/*global angular,_,moment */

/**
 * @ngdoc controller
 * @name TatUi.controller:MessagesMonitoringViewListCtrl
 * @requires TatUi.WebSocket            Websocket manager
 * @requires TatUi.TatEngineMessagesRsc Tat Engine Resource Messages
 * @requires TatUi.TatEngineMessageRsc  Tat Engine Resource Message
 * @requires TatUi.TatEngine            Global Tat Engine service
 *
 * @description List Messages controller
 */
angular.module('TatUi')
  .controller('MessagesMonitoringViewListCtrl', function(
    $scope,
    $rootScope,
    $stateParams,
    Authentication,
    WebSocket,
    TatEngineMessagesRsc,
    TatEngineMessageRsc,
    TatEngineTopicsRsc,
    TatEngineUserRsc,
    TatEngine,
    Flash,
    $translate,
    $interval,
    $location,
    $localStorage
  ) {
    'use strict';

    var self = this;
    this.topic = $stateParams.topic;

    self.tmpFilter = {};
    if (!$localStorage.messagesFilters) {
      $localStorage.messagesFilters = {};
    }
    if (!$localStorage.messagesFilters[this.topic]) {
      $localStorage.messagesFilters[this.topic] = {};
    }

    this.data = {
      messages: [],
      requestFrequency: 10000,
      count: 2000,
      skip: 0,
      isTopicBookmarks: false,
      isTopicTasks: false,
      isTopicDeletableMsg: false,
      isTopicDeletableAllMsg: false,
      isTopicUpdatableMsg: false,
      isTopicUpdatableAllMsg: false,
      isTopicRw: true,
      displayMore: true,
      stacked: [],
      nbUP: 0,
      nbAL: 0,
      nbOther: 0
    };

    this.filterPosition = {
      x: 380,
      y: 62,
      visible: false
    };

    this.filter = {};

    this.getCurrentDate = function() {
      return moment().format("YYYY/MM/DD-HH:MM");
    };

    this.currentDate = self.getCurrentDate();

    /**
     * @ngdoc function
     * @name loadMore
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Try to load more messages
     */
    this.loadMore = function() {
      if (!self.loading) {
        self.moreMessage();
      }
    };

    this.isMonitoring = function(message) {
      if (message.tags && message.tags.length >= 3) {
        if (
          (message.tags[0] === 'monitoring') &&
          (message.tags[2].indexOf('item:') === 0)
        ) {
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

    this.getItem = function(message) {
      if (self.isMonitoring(message)) {
        //len item: == 5
        return message.tags[2].substring(5, message.tags[2].length);
      }
    };

    this.getService = function(message) {
      if (self.isMonitoring(message)) {
        return message.tags[1];
      }
    };

    /**
     * @ngdoc function
     * @name createMessage
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Post a new message on the current topic
     * @param {string} msg Message to post
     */
    this.createMessage = function() {
      TatEngineMessageRsc.create({
        text: self.currentMessage,
        topic: self.topic
      }).$promise.then(function(data) {
        self.currentMessage = '';
        self.data.messages.unshift(data.message);
      }, function(err) {
        TatEngine.displayReturn(err);
      });
    };

    this.getBrightness = function(rgb) {
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
    this.mergeMessages = function(dest, source) {
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
            origin.tags = source[i].tags;
          } else {
            if (!self.data.intervalTimeStamp) {
              self.data.intervalTimeStamp = source[i].dateUpdate;
            } else if (source[i].dateUpdate > self.data.intervalTimeStamp) {
              self.data.intervalTimeStamp = source[i].dateUpdate;
            }
            dest.push(source[i]);
            dest.sort(function(a, b) {
              if (a.dateCreation > b.dateCreation) {
                return -1;
              }
              if (a.dateCreation < b.dateCreation) {
                return 1;
              }
              return 0;
            });
          }
        }
      }
      return dest;
    };

    /**
     * @ngdoc function
     * @name beginTimer
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Launch the timer to request messages at regular time interval
     * @param {Integer} timeInterval Milliseconds between calls
     */
    this.beginTimer = function(timeInterval) {
      if ('undefined' === typeof self.data.timer) {
        self.data.timer = $interval(self.getNewMessages, timeInterval);
        $scope.$on(
          '$destroy',
          function() {
            self.stopTimer();
          }
        );
      }
    };

    /**
     * @ngdoc function
     * @name stopTimer
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Stop the time that request messages at regular time interval
     */
    this.stopTimer = function() {
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
    this.buildFilter = function(data) {
      return angular.extend({}, data, self.filter);
    };

    /**
     * @ngdoc function
     * @name filterSearch
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Filter messages
     */
    this.filterSearch = function() {
      self.data.skip = 0;
      self.data.displayMore = true;
      self.filter.text =
        self.tmpFilter.filterText ? self.tmpFilter.filterText : null;
      self.filter.label =
        self.tmpFilter.filterInLabel ? self.tmpFilter.filterInLabel : null;
      self.filter.andLabel =
        self.tmpFilter.filterAndLabel ? self.tmpFilter.filterAndLabel :
        null;
      self.filter.notLabel =
        self.tmpFilter.filterNotLabel ? self.tmpFilter.filterNotLabel :
        null;
      self.filter.tag = self.tmpFilter.filterInTag ? self.tmpFilter.filterInTag :
        null;
      self.filter.andTag = self.tmpFilter.filterAndTag ? self.tmpFilter.filterAndTag :
        null;
      self.filter.notTag = self.tmpFilter.filterNotTag ? self.tmpFilter.filterNotTag :
        null;

      if (self.tmpFilter.idMessage === '-1') {
        $rootScope.$broadcast('topic-change', {
          topic: self.topic,
          reload: true
        });
      } else {
        self.filter.idMessage = $stateParams.idMessage
      }

      self.setFilter('filterInLabel');
      self.setFilter('filterAndLabel');
      self.setFilter('filterNotLabel');
      self.setFilter('filterInTag');
      self.setFilter('filterAndTag');
      self.setFilter('filterNotTag');

      this.refresh();
    };

    this.setFilter = function(key) {
      if (self.tmpFilter[key] === '' || self.tmpFilter[key] === undefined) {
        $location.search(key, null);
      } else {
        $location.search(key, self.tmpFilter[key]);
      }
      $localStorage.messagesFilters[self.topic][key] = self.tmpFilter[key];
    };

    this.onCall = function(text) {
      self.currentMessage = text;
    };

    /**
     * @ngdoc function
     * @name getNewMessages
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Request for new messages
     */
    this.getNewMessages = function() {
      if (self.loading) {
        console.log("messages list already in refresh...");
        return;
      }
      self.loading = true;
      self.currentDate = self.getCurrentDate();
      var filter = self.buildFilter({
        topic: self.topic,
        onlyMsgRoot: true
      });
      if (!filter.label && !filter.andLabel && !filter.notLabel) {
        filter.dateMinUpdate = self.data.intervalTimeStamp;
      }

      return TatEngineMessagesRsc.list(filter).$promise.then(function(
        data) {
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
    this.moreMessage = function() {
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
    this.digestInformations = function(data) {
      self.data.isTopicRw = data.isTopicRw;
      if (_.contains(Authentication.getIdentity().favoritesTopics, '/' +
          self.topic)) {
        self.data.isFavoriteTopic = true;
      }
      if (!filter.label && !filter.andLabel && !filter.notLabel) {
        self.data.messages = data.messages;
      } else {
        self.data.messages = self.mergeMessages(self.data.messages, data.messages);
      }
      self.loading = false;
      self.computeStack();
    };

    this.computeStack = function() {
      var nbTotal = self.data.messages.length;
      self.data.nbUP = 0;
      self.data.nbAL = 0;
      self.data.nbOther = 0;

      if (nbTotal == 0) {
        return;
      }

      for (var i = 0; i < nbTotal; i++) {
        self.computeStatus(self.data.messages[i]);
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
     * @name initFiltersFromParam
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description
     */
    this.initFiltersFromParam = function() {
      self.initFilterField('filterInLabel');
      self.initFilterField('filterAndLabel');
      self.initFilterField('filterNotLabel');
      self.initFilterField('filterInTag');
      self.initFilterField('filterAndTag');
      self.initFilterField('filterNotTag');
    };

    /**
     * @ngdoc function
     * @name initFilterField
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description
     */
    this.initFilterField = function(key) {
      if ($stateParams[key]) {
        self.tmpFilter[key] = $stateParams[key];
      } else if ($localStorage.messagesFilters[self.topic][key]) {
        self.tmpFilter[key] = $localStorage.messagesFilters[self.topic][key];
      }
    };

    /**
     * @ngdoc function
     * @name init
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Initialize list messages page. Get list of messages from Tat Engine
     */
    this.init = function() {
      $rootScope.$broadcast('menu-expand', self.topic.split('/'));

      self.initFiltersFromParam();
      self.filterSearch();

      TatEngineTopicsRsc.list({
        topic: self.topic
      }).$promise.then(function(data) {
        if ((!data.topics) || (!data.topics.length)) {
          Flash.create('danger', $translate.instant('topics_notopic'));
          return;
        }
        self.data.topic = data.topics[0];
        self.data.isTopicUpdatableMsg = self.data.topic.canUpdateMsg;
        self.data.isTopicDeletableMsg = self.data.topic.canDeleteMsg;
        self.data.isTopicUpdatableAllMsg = self.data.topic.canUpdateAllMsg;
        self.data.isTopicDeletableAllMsg = self.data.topic.canDeleteAllMsg;
        if (self.data.topic.topic.indexOf('/Private/' +
            Authentication.getIdentity().username + '/Bookmarks') ===
          0) {
          self.data.isTopicBookmarks = true;
        } else if (self.data.topic.topic.indexOf('/Private/' +
            Authentication.getIdentity().username + '/Tasks') === 0) {
          self.data.isTopicTasks = true;
        } else if (self.data.topic.topic.indexOf('/Private/' +
            Authentication.getIdentity().username + '/DM/') === 0) {
          self.data.isTopicDeletableMsg = false;
        } else if (self.data.topic.topic.indexOf('/Private/' +
            Authentication.getIdentity().username) === 0) {
          self.data.isTopicDeletableMsg = true;
        }
        self.beginTimer(self.data.requestFrequency);
      }, function(err) {
        TatEngine.displayReturn(err);
      });
    };


    /**
     * @ngdoc function
     * @name refresh
     * @methodOf TatUi.controller:MessagesMonitoringViewListCtrl
     * @description Refresh all the messages
     */
    this.refresh = function() {
      $rootScope.$broadcast('loading', true);
      self.data.currentTimestamp = Math.ceil(new Date().getTime() / 1000);
      self.data.messages = [];
      self.moreMessage().then(function() {
        $rootScope.$broadcast('loading', false);
      });
    };

    this.setMessage = function(message) {
      message.displayed = true;
      $scope.message = message;
    };

    this.toggleMessage = function(message) {
      var same = false;
      if ($scope.message) {
        // unload previous replies
        $scope.message.replies = [];
      }
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

    this.closeMessage = function(message) {
      $scope.message.displayed = false;
      $scope.message = null;
    };

    this.containsLabel = function(message, labelText) {
      if (message.inReplyOfIDRoot) {
        return false;
      }
      var r = false;
      if (message.labels) {
        for (var i = 0; i < message.labels.length; i++) {
          var l = message.labels[i];
          if (l.text === labelText) {
            return true;
          }
        }
      }
      return r;
    };

    this.init();
  });
