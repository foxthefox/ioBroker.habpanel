(function() {
    'use strict';

    // init ioBroker connector
    servConn.namespace   = 'habpanel.0';
    servConn._useStorage = false;

    angular
        .module('app.services')
        .service('OHService', IOBService)
        .value('OH2ServiceConfiguration', {})
        .service('OH2StorageService', OH2StorageService);

    IOBService.$inject = ['$rootScope', '$http', '$q', '$timeout', '$interval', '$filter', '$location', 'SpeechService', '$translate'];
    var connectPromise = null;
    var connecting = false;

    function IOBService($rootScope, $http, $q, $timeout, $interval, $filter, $location, SpeechService, $translate) {
        this.getItem = getItem;
        this.getItems = getItems;
        this.getObjects = getObjects;
        this.getObject = getObject;
        this.getLocale = getLocale;
        this.onUpdate = onUpdate;
        this.sendCmd = sendCmd;
        this.sendVoice = sendVoice;
        this.reloadItems = reloadItems;
        this.getTimeSeries = getTimeSeries;

        var locale = null;
        var timeout;
        var subscribes = [];

        ////////////////

        function onUpdate(scope, name, callback) {
            var handler = $rootScope.$on('iobroker-update', callback);
            scope.$on('$destroy', handler);
        }

        function loadItems() {
            connect().then(function () {
                if (!$rootScope.items) {
                    servConn.getObjects(false, function (err, items) {
                        servConn.getStates(null, function (err, valueItems) {
                            var count = 0;
                            for (var id in items) {
                                Object.assign(items[id], valueItems[id]);
                                valueItems[id] = valueItems[id] || {};
                                items[id].label = id;
                                items[id].name = id;
                                items[id].state = (valueItems[id].val !== null && valueItems[id].val !== undefined) ? valueItems[id].val.toString() : '';
                                count++;
                            }
                            console.log('Received ' + count + ' states.');
                            $rootScope.items = items;
                            $rootScope.$emit('iobroker-update');
                        });
                    });
                } else {
                    $rootScope.$emit('iobroker-update');
                    let items = $rootScope.items;
                    servConn.getStates(null, function (err, valueItems) {
                        var count = 0;
                        for (var id in items) {
                            Object.assign(items[id], valueItems[id]);
                            valueItems[id] = valueItems[id] || {};
                            items[id].label = id;
                            items[id].name = id;
                            items[id].state = (valueItems[id].val !== null && valueItems[id].val !== undefined) ? valueItems[id].val.toString() : '';
                            count++;
                        }
                        console.log('Received ' + count + ' states.');
                        $rootScope.items = items;
                        $rootScope.$emit('iobroker-update');
                    });
                }
            });
        }

        function getItem(name) {
            if (name && subscribes.indexOf(name) === -1) {
                subscribes.push(name);
                servConn.subscribe(name);
            }

            return $rootScope.items ? $rootScope.items[name] || {state: ''} : {state: ''};
        }

        function getItems() {
            return $rootScope.items;
        }

        function getObject(id) {
            var deferred = $q.defer();

            if ($rootScope.objects) {
                deferred.resolve($rootScope.objects[id]);
            } else {
                connect().then(function () {
                    servConn.getObjects(false, function (err, data) {
                        if (err) {
                            $rootScope.objects = {};
                        } else {
                            $rootScope.objects = data;
                        }
                        deferred.resolve($rootScope.objects[id]);
                    });
                });
            }
            return deferred.promise;
        }
        
        function getObjects() {
            var deferred = $q.defer();
            if ($rootScope.objects) {
                deferred.resolve($rootScope.objects);
            } else {
                connect().then(function () {
                    servConn.getObjects(false, function (err, data) {
                        if (err) {
                            $rootScope.objects = {};
                        } else {
                            $rootScope.objects = data;
                        }
                        deferred.resolve($rootScope.objects);
                    });
                });
            }

            return deferred.promise;
        }

        function getTimeSeries(service, item, start, end) {
            var deferred = $q.defer();

            connect().then(function () {
                servConn.getHistory(item, { //it seems that this function always goes to history.0 or to default history instance defined in system
                    id:       item, // probably not necessary to put it here again
                    start:    start,
                    end:      end,
                    ignoreNull: true,
                    aggregate: 'onchange' //minmax
                }, function (err, dataIOB) { // values from IOB have val and ts instead of state and time
                    var  dataOHAB= dataIOB.map(obj =>{ var newArr = {}; newArr['state'] = obj.val; newArr['time'] = obj.ts; return newArr; });
                    deferred.resolve({data: {name: item, data: dataOHAB}});
                });
            });

            return deferred.promise;
        }
        /**
         * Sends command to ioBroker
         * @param  {string} item Item's id
         * @param  {string} cmd  Command
         */
        function sendCmd(item, cmd) {
            connect().then(function () {
                var f = parseFloat(cmd);
                if (f.toString() === cmd) {
                    cmd = f;
                } else if (cmd === 'true' || cmd === 'ON') {
                    cmd = true;
                } else if (cmd === 'false' || cmd === 'OFF') {
                    cmd = false;
                }
                servConn.setState(item, cmd);
            });
        }

        /**
         * Returns a promise with the configured locale
         */
        function getLocale() {
            var deferred = $q.defer();
            if (locale) {
                deferred.resolve(locale);
            } else {
                connect().then(function () {
                    servConn.getConfig(function (err, data) {
                        var language;

                        if (err) {
                            locale = navigator.languages[0];
                            language = locale.split('-')[0];
                        } else {
                            locale = data.language;
                            language = locale.split('-')[0];
                        }

                        /* consider the region only for selected common exceptions where the date/number formats
                        are significantly different than the language's default.
                        If more are needed change the gulpfile.js too and run the 'vendor-angular-i18n' gulp task */
                        if (['es-ar', 'de-at', 'en-au', 'fr-be', 'es-bo', 'pt-br', 'en-ca',
                            'fr-ca', 'fr-ch', 'es-co', 'en-gb', 'en-hk', 'zh-hk', 'en-ie',
                            'en-in', 'fr-lu', 'es-mx', 'en-nz', 'en-sg', 'zh-sg',
                            'es-us', 'zh-tw', 'en-za'].indexOf(locale.toLowerCase()) < 0) {
                            locale = language;
                        }

                        if (language !== "en") {
                            console.log('Setting interface language to: ' + language);
                            $translate.use(language);
                        }
                        console.log('Setting locale to: ' + locale);
                        deferred.resolve(locale);
                    });
                });
            }

            return deferred.promise;
        }

        /**
         * Sends request to ioBroker REST
         * voice interpreters
         * @param  {string} text - STT output
         */
        function sendVoice(text) {
            connect().then(function () {
                // todo
                servConn.setState('text2command.0.text', text);
            });
        }

        function reloadItems() {
            loadItems();
        }

        // give 2 seconds for connection establishment
        timeout = setTimeout(function () {
            timeout = null;
            $rootScope.reconnecting = true;
        }, 2000);

        function connect() {
            if (!connecting) {
                connecting = true;

                connectPromise = connectPromise || $q.defer();

                servConn.init(null, {
                    onConnChange: function (isConnected) {
                        if (timeout) {
                            clearTimeout(timeout);
                            timeout = null;
                        }
                        if (isConnected) {
                            console.log('connected');
                            $rootScope.reconnecting = false;
                        } else {
                            console.log('disconnected');
                            $rootScope.reconnecting = true;
                        }
                        connectPromise.resolve();
                    },
                    onRefresh: function () {
                        window.location.reload();
                    },
                    onUpdate: function (id, state) {
                        setTimeout(function () {
                            if (!id  || !state || !$rootScope.items) return;

                            var newstate = (state.val !== null && state.val !== undefined) ? state.val.toString() : '';
                            var item = $rootScope.items[id] = $rootScope.items[id] || {state: ''};

                            if (item && item.state !== newstate) {
                                $rootScope.$apply(function () {
                                    //console.log("Updating " + item.name + " state from " + item.state + " to " + newstate);
                                    item.state = newstate;
                                    $rootScope.$emit('iobroker-update', item);

                                    if (item.state && $rootScope.settings.speech_synthesis_item === item.name) {
                                        console.log('Speech synthesis item state changed! Speaking it now.');
                                        SpeechService.speak($rootScope.settings.speech_synthesis_voice, item.state);
                                    }

                                    if (item.state && $rootScope.settings.dashboard_control_item === item.name) {
                                        console.log('Dashboard control item state changed, attempting navigation to: ' + item.state);
                                        $location.url('/view/' + item.state);
                                    }

                                });
                            }
                        }, 0);
                    },
                    onError: function (err) {
                        console.error('Cannot execute %s for %s, because of insufficient permissions', err.command, err.arg, 'Insufficient permissions', 'alert', 600);
                        connectPromise.reject();
                    }
                }, false, false);
            }
            return connectPromise.promise;
        }

        connect();
    }

    OH2StorageService.$inject = ['OH2ServiceConfiguration', '$rootScope', '$http', '$q', 'localStorageService'];
    function OH2StorageService(OH2ServiceConfiguration, $rootScope, $http, $q, localStorageService) {
        this.tryGetServiceConfiguration = tryGetServiceConfiguration;
        this.saveServiceConfiguration = saveServiceConfiguration;
        this.saveCurrentPanelConfig = saveCurrentPanelConfig;
        this.setCurrentPanelConfig = setCurrentPanelConfig;
        this.getCurrentPanelConfig = getCurrentPanelConfig;
        this.useCurrentPanelConfig = useCurrentPanelConfig;
        this.useLocalStorage = useLocalStorage;

        function tryGetServiceConfiguration() {
            connectPromise = connectPromise || $q.defer();
            var deferred = $q.defer();

            connectPromise.promise.then(function () {
                servConn.getObject(servConn.namespace + '.config', function (err, obj) {
                    OH2ServiceConfiguration = obj ? obj.native : null;
                    OH2ServiceConfiguration = OH2ServiceConfiguration || {
                        initialPanelConfig: 'Demo',
                        lockEditing: false,
                        panelsRegistry: {
                            'Demo': {}
                        }

                    };
                    $rootScope.panelsRegistry = OH2ServiceConfiguration.panelsRegistry;

                    if (OH2ServiceConfiguration.lockEditing === true) {
                        $rootScope.lockEditing = true;
                    }
                    // iterate over the config to find widgets added there
                    $rootScope.configWidgets = {};

                    angular.forEach(OH2ServiceConfiguration, function (value, key) {
                        if (key.match(/^widget\./)) {
                            var widgetname = key.replace('widget.', '');
                            console.log('Adding widget from configuration: ' + widgetname);
                            $rootScope.configWidgets[widgetname] = JSON.parse(value);
                        }
                    });
                    deferred.resolve();
                })
            });
            //connect()
            /*$http.get('/rest/services/' + SERVICE_NAME + '/config').then(function (resp) {
             console.log('service configuration loaded');
             OH2ServiceConfiguration = resp.data;
             if (!OH2ServiceConfiguration.panelsRegistry) {
             $rootScope.panelsRegistry = OH2ServiceConfiguration.panelsRegistry = {};
             } else {
             $rootScope.panelsRegistry = JSON.parse(resp.data.panelsRegistry);
             }
             if (OH2ServiceConfiguration.lockEditing === true) {
             $rootScope.lockEditing = true;
             }
             // iterate over the config to find widgets added there
             $rootScope.configWidgets = {};

             angular.forEach(OH2ServiceConfiguration, function (value, key) {
             if (key.indexOf("widget.") === 0) {
             var widgetname = key.replace("widget.", "");
             console.log("Adding widget from configuration: " + widgetname);
             $rootScope.configWidgets[widgetname] = JSON.parse(value);
             }
             });

             deferred.resolve();

             }, function (err) {
             console.error('Cannot load service configuration: ' + JSON.stringify(err));

             deferred.reject();
             });*/

            return deferred.promise;
        }

        function saveServiceConfiguration() {
            var deferred = $q.defer();
            connectPromise = connectPromise || $q.defer();

            if ($rootScope.panelsRegistry) {
                OH2ServiceConfiguration.panelsRegistry = $rootScope.panelsRegistry;
            }
            connectPromise.promise.then(function () {
                servConn.getObject(servConn.namespace + '.config', function (err, obj) {
                    obj = obj || {
                            _id: servConn.namespace + '.config',
                            common: {
                                name: 'habpanel configuration'
                            },
                            type: 'config',
                            native: OH2ServiceConfiguration.initialPanelConfig
                        };
                    obj.native = OH2ServiceConfiguration;
                    servConn._socket.emit('setObject', servConn.namespace + '.config', obj, function (err, res) {
                        if (err) {
                            console.error('Error while saving service configuration: ' + JSON.stringify(err));
                            deferred.reject();
                        } else {
                            deferred.resolve();
                        }
                    });
                });
            });

            setTimeout(function () {
                deferred.resolve();
            }, 1000);

            return deferred.promise;

        }

        function saveCurrentPanelConfig() {
            var deferred = $q.defer();

            var lastUpdatedTime = $rootScope.panelsRegistry[getCurrentPanelConfig()].updatedTime;

            // fetch the current configuration again (to perform optimistic concurrency on the current panel config only)
            tryGetServiceConfiguration().then(function () {
                var config = $rootScope.panelsRegistry[getCurrentPanelConfig()];
                if (!config) {
                    console.warn('Warning: creating new panel config!');
                    config = $rootScope.panelsRegistry[getCurrentPanelConfig()] = { };
                }
                var currentUpdatedTime = config.updatedTime;
                if (Date.parse(currentUpdatedTime) > Date.parse(lastUpdatedTime)) {
                    deferred.reject('Panel configuration has a newer version on the server updated on ' + currentUpdatedTime);
                    return;
                }
                config.updatedTime = new Date().toISOString();
                config.dashboards = angular.copy($rootScope.dashboards);
                config.menucolumns = $rootScope.menucolumns;
                config.settings = $rootScope.settings;
                config.customwidgets = $rootScope.customwidgets;
                return saveServiceConfiguration().then(function () {
                    deferred.resolve();
                }, function () {
                    deferred.reject();
                });
            });

            return deferred.promise;
        }

        function useLocalStorage() {
            $rootScope.currentPanelConfig = undefined;
            localStorageService.set('currentPanelConfig', $rootScope.currentPanelConfig);
        }

        function getCurrentPanelConfig() {
            if (!$rootScope.currentPanelConfig) {
                $rootScope.currentPanelConfig = localStorageService.get('currentPanelConfig');

                if (!$rootScope.currentPanelConfig) {
                    // if it's still not set and we have an initial panel config, switch to it
                    var initialPanelConfig = OH2ServiceConfiguration.initialPanelConfig;
                    if (!$rootScope.panelsRegistry[initialPanelConfig]) {
                        for (var panel in $rootScope.panelsRegistry) {
                            initialPanelConfig = panel;
                            break;
                        }
                    }


                    if (initialPanelConfig && $rootScope.panelsRegistry[initialPanelConfig]) {
                        $rootScope.currentPanelConfig = initialPanelConfig;
                        localStorageService.set('currentPanelConfig', initialPanelConfig);
                    }
                }
            }
            return $rootScope.currentPanelConfig;
        }

        function useCurrentPanelConfig() {
            var currentPanelConfig = getCurrentPanelConfig();
            if (!currentPanelConfig || !$rootScope.panelsRegistry[currentPanelConfig]) {
                console.warn("Warning: current panel config not found, falling back to local storage!");
                useLocalStorage();
            } else {
                if ($rootScope.panelsRegistry[currentPanelConfig].dashboards)
                    $rootScope.dashboards = angular.copy($rootScope.panelsRegistry[currentPanelConfig].dashboards);
                else
                    $rootScope.dashboards = [];
                if ($rootScope.panelsRegistry[currentPanelConfig].menucolumns)
                    $rootScope.menucolumns = $rootScope.panelsRegistry[currentPanelConfig].menucolumns;
                else
                    $rootScope.menucolumns = 1;
                if ($rootScope.panelsRegistry[currentPanelConfig].settings)
                    $rootScope.settings = $rootScope.panelsRegistry[currentPanelConfig].settings;
                else
                    $rootScope.settings = {};
                if ($rootScope.panelsRegistry[currentPanelConfig].customwidgets)
                    $rootScope.customwidgets = $rootScope.panelsRegistry[currentPanelConfig].customwidgets;
                else
                    $rootScope.customwidgets = {};
            }
        }

        function setCurrentPanelConfig(name) {
            $rootScope.currentPanelConfig = name;
            localStorageService.set('currentPanelConfig', $rootScope.currentPanelConfig);
            useCurrentPanelConfig();
        }
    }
})();
