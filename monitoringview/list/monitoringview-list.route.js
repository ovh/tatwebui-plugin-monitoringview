/*global angular*/
angular.module('TatUi').config(function($stateProvider, PluginProvider) {
  'use strict';

  PluginProvider.addPlugin({
    'name': 'Monitoring View',
    'route': 'monitoringview-list',
    'type': 'messages-views'
  });

  $stateProvider.state('monitoringview-list', {
    url: '/monitoringview/list/{topic:topicRoute}?idMessage&filterInLabel&filterAndLabel&filterNotLabel&filterInTag&filterAndTag&filterNotTag',
    templateUrl: '../build/tatwebui-plugin-monitoringview/monitoringview/list/monitoringview-list.view.html',
    controller: 'MessagesMonitoringViewListCtrl',
    controllerAs: 'ctrl',
    reloadOnSearch: false,
    translations: [
      'plugins/tatwebui-plugin-monitoringview/monitoringview'
    ]
  });
});
