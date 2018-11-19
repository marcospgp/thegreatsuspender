/* global chrome, gsIndexedDb, gsUtils */
// eslint-disable-next-line no-unused-vars
var historyUtils = (function(global) {
  'use strict';

  if (!chrome.extension.getBackgroundPage().tgs) return;
  chrome.extension
    .getBackgroundPage()
    .tgs.setViewGlobals(global, 'historyUtils');

  var noop = function() {};

  function importSession(e) {
    var f = e.target.files[0];
    if (f) {
      var r = new FileReader();
      r.onload = function(e) {
        var contents = e.target.result;
        if (f.type !== 'text/plain') {
          alert(chrome.i18n.getMessage('js_history_import_fail'));
        } else {
          handleImport(f.name, contents).then(function() {
            window.location.reload();
          });
        }
      };
      r.readAsText(f);
    } else {
      alert(chrome.i18n.getMessage('js_history_import_fail'));
    }
  }

  async function handleImport(sessionName, textContents) {
    sessionName = window.prompt(
      chrome.i18n.getMessage('js_history_enter_name_for_session'),
      sessionName
    );
    if (sessionName) {
      const shouldSave = await new Promise(resolve => {
        validateNewSessionName(sessionName, function(result) {
          resolve(result);
        });
      });
      if (!shouldSave) {
        return;
      }

      var sessionId = '_' + gsUtils.generateHashCode(sessionName);
      var windows = [];

      var createNextWindow = function() {
        return {
          id: sessionId + '_' + windows.length,
          tabs: [],
        };
      };
      var curWindow = createNextWindow();

      for (const line of textContents.split('\n')) {
        if (typeof line !== 'string') {
          continue;
        }
        if (line === '') {
          if (curWindow.tabs.length > 0) {
            windows.push(curWindow);
            curWindow = createNextWindow();
          }
          continue;
        }
        if (line.indexOf('://') < 0) {
          continue;
        }
        const tabInfo = {
          windowId: curWindow.id,
          sessionId: sessionId,
          id: curWindow.id + '_' + curWindow.tabs.length,
          url: line,
          title: line,
          index: curWindow.tabs.length,
          pinned: false,
        };
        const savedTabInfo = await gsIndexedDb.fetchTabInfo(line);
        if (savedTabInfo) {
          tabInfo.title = savedTabInfo.title;
          tabInfo.favIconUrl = savedTabInfo.favIconUrl;
        }
        curWindow.tabs.push(tabInfo);
      }
      if (curWindow.tabs.length > 0) {
        windows.push(curWindow);
      }

      var session = {
        name: sessionName,
        sessionId: sessionId,
        windows: windows,
        date: new Date().toISOString(),
      };
      await gsIndexedDb.updateSession(session);
    }
  }

  function exportSessionWithId(sessionId, callback) {
    callback = typeof callback !== 'function' ? noop : callback;

    gsIndexedDb.fetchSessionBySessionId(sessionId).then(function(session) {
      if (!session || !session.windows) {
        callback();
      } else {
        exportSession(session, callback);
      }
    });
  }

  function exportSession(session, callback) {
    const dataUriPrefix = 'data:text/plain;charset=utf-8;base64,';
    let dataUriContent = '';

    session.windows.forEach(function(curWindow, index) {
      curWindow.tabs.forEach(function(curTab, tabIndex) {
        if (gsUtils.isSuspendedTab(curTab)) {
          dataUriContent += gsUtils.getOriginalUrl(curTab.url) + '\n';
        } else {
          dataUriContent += curTab.url + '\n';
        }
      });
      //add an extra newline to separate windows
      dataUriContent += '\n';
    });

    var encodedUri = dataUriPrefix + btoa(dataUriContent);
    var link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'session.txt');
    link.click();
    callback();
  }

  function validateNewSessionName(sessionName, callback) {
    gsIndexedDb.fetchSavedSessions().then(function(savedSessions) {
      var nameExists = savedSessions.some(function(savedSession, index) {
        return savedSession.name === sessionName;
      });
      if (nameExists) {
        var overwrite = window.confirm(
          chrome.i18n.getMessage('js_history_confirm_session_overwrite')
        );
        if (!overwrite) {
          callback(false);
          return;
        }
      }
      callback(true);
    });
  }

  function saveSession(sessionId) {
    gsIndexedDb.fetchSessionBySessionId(sessionId).then(function(session) {
      var sessionName = window.prompt(
        chrome.i18n.getMessage('js_history_enter_name_for_session')
      );
      if (sessionName) {
        historyUtils.validateNewSessionName(sessionName, function(shouldSave) {
          if (shouldSave) {
            session.name = sessionName;
            gsIndexedDb.addToSavedSessions(session).then(function() {
              window.location.reload();
            });
          }
        });
      }
    });
  }

  return {
    importSession,
    exportSession,
    exportSessionWithId,
    validateNewSessionName,
    saveSession,
  };
})(this);
