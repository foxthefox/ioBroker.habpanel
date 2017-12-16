(function() {
'use strict';

    angular
        .module('app')
        .controller('SettingsLocalConfigCtrl', SettingsLocalConfigController);

    SettingsLocalConfigController.$inject = ['$rootScope', '$timeout', 'OH2ServiceConfiguration', 'OH2StorageService', 'PersistenceService', 'prompt', 'clipboard', 'Blob', 'FileSaver', 'LocalFileReader'];
    function SettingsLocalConfigController($rootScope, $timeout, OH2ServiceConfiguration, OH2StorageService, PersistenceService, prompt, clipboard, Blob, FileSaver, LocalFileReader) {
        var vm = this;

        vm.editorOptions = {
            lineNumbers: true,
            matchBrackets: true,
            autoCloseBrackets: true,
            mode: "application/json",
            json: true,
            theme: "rubyblue",
            viewportMargin: Infinity
        };

        function resetButtons() {
            vm.saveLabel = "Save";
            vm.copyLabel = "Copy";
        }

        function checkFormat(config) {
            // handle legacy save files with the dashboards array only
            if (angular.isArray(config)) {
                config = {
                    dashboards: config,
                    menucolumns: 1,
                    settings: {},
                    customwidgets: {}
                };
            }

            vm.rawLocalConfig = JSON.stringify(config, null, 4);
            return config;
        }

        vm.rawLocalConfig = JSON.stringify({
            dashboards: $rootScope.dashboards,
            menucolumns: $rootScope.menucolumns,
            settings: $rootScope.settings,
            customwidgets: $rootScope.customwidgets
        }, null, 4);
        vm.file = {};

        vm.copiedToClipboard = function (success) {
            if (success) {
                vm.copyLabel = "Copied!";
                $timeout(resetButtons, 2000);
            } else {
                vm.copyLabel = "FAILED!";
                $timeout(resetButtons, 2000);
            }
        };

        vm.importFile = function (file) {
            LocalFileReader.readFile(file, $rootScope).then(function (text) {
                try {
                    vm.importMode = false;
                    var json = JSON.parse(text);

                    checkFormat(json);
                    vm.saveConfig();
                } catch (e) {
                    prompt({
                        title: "Error",
                        message: "Problem while importing: " + e,
                        buttons: [{ label:'OK', primary: true }]
                    });
                }
            });
        }

        vm.exportToFile = function () {
            var data = new Blob([vm.rawLocalConfig], { type: 'application/json;charset=utf-8'});
            FileSaver.saveAs(data, 'habpanel-config.json');
        }

        vm.saveConfig = function () {
            try {
                var newconf = checkFormat(JSON.parse(vm.rawLocalConfig));

                if (!newconf.dashboards) {
                    throw 'No dashboards found!';
                }

                angular.copy(newconf.dashboards, $rootScope.dashboards);
                angular.copy(newconf.settings, $rootScope.settings);
                angular.copy(newconf.customwidgets, $rootScope.customwidgets);
                $rootScope.menucolumns = newconf.menucolumns;

                PersistenceService.saveDashboards();
                PersistenceService.getDashboards();
                vm.saveLabel = "Saved!";
                $timeout(resetButtons, 2000);
            } catch (e) {
                prompt({
                    title: "Error",
                    message: "Configuration parsing error, nothing has been modified: " + e,
                    buttons: [{ label:'OK', primary: true }]
                });
            }
        };

        activate();

        ////////////////

        function activate() {
            $timeout(function () {
                vm.refreshEditor = new Date();
            }, 200);

            resetButtons();
        }
    }
})();