//chrome.storage.local.clear(function () { console.log('cleared'); });
var dic = ''; // dictionary string
var rules = {
    rules: null,
    abbrs: null,
    disabledAbbrs: {},
    disabledRules: {},
    customRules: []
}; 
// remote rules
var disabled = {domains: {}, pages: {}}; // settings for disabled domains and pages
var options = {
    language: 'pt-PT',
    spelling: 0,
    accentuation: true,
    abbreviations: true,
    capitalization: true
};

// log
var log = console.log.bind(console);

log('Loading background page.');

var ajax = function (url, success) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
            success(xhr.responseText);
        }
    };
    xhr.send();
};

// retrieve remote rules
var checkUpdateRules = function () {
    if (!rules.rules || Date.now() - rules.rulesTime > rules.updateInterval * 1000) { 
        log("NaziGramatical: Updating rules.");
        rules.rulesTime = Date.now();
        ajax('http://nazigramatical.x10.bz/rules.php', function (responseText) {
            var data = JSON.parse(responseText);
            rules.updateInterval = Math.min(604800, data.updateInterval);
            rules.rules = data.rules;
            rules.abbrs = data.abbrs;
            rules.parsedRules = null;
            chrome.storage.local.set({'rules': rules});
            log("NaziGramatical: Rules updated. Next update: "+data.updateInterval+" secs.");
        });
    }
};

// load dictionary
var loadDic = function () {
    log('Loading dic...');
    var init = Date.now();
    ajax(chrome.extension.getURL('pt.dic'), function (responseText) {
        // dic = "\n" + responseText + "\n";
        var code = options.language == 'pt-PT' ?
            (options.spelling == 1 ? '[^2367]' : (options.spelling == 2 ? '[^1357]' : '[^123567]')) : '[^4567]';
        log('Dic code:', code);
        dic = "\n" + (responseText + "\n").replace(new RegExp('^.+' + code + '\n', 'gm'), '').replace(/\d/g, '');
        log("Dic loaded. (" + dic.length + " bytes, " + (Date.now() - init) + " ms)");
    });
};

// message handler
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    log('Message received from:', sender , ':', message);
    var response = {};
    if ('getDic' in message) {
        response.dic = dic;
    }
    if ('getRules' in message) {
        checkUpdateRules();
        response.rules = [].concat(rules.customRules); // preserve rules.customRules
        response.abbrs = [];
        // fixme: cache active rules for efficiency
        for (var i = 0; i < rules.rules.length; i++) {
            if (!rules.disabledRules[rules.rules[i][0]]) response.rules.push(rules.rules[i]);
        }
        for (var i = 0; i < rules.abbrs.length; i++) {
            if (!rules.disabledAbbrs[rules.abbrs[i][0]]) response.abbrs.push(rules.abbrs[i]);
        }
    }
    if ('isDisabled' in message) {
        response.isDisabled = isDisabledUrl(message.isDisabled) || false;
    }
    if ('isPortuguese' in message) {
        updateBadgeBackground(message.isPortuguese);
        chrome.browserAction.setBadgeBackgroundColor({color: message.isPortuguese ? '#248c23' : '#C4C4C4'});
    }
    if ('detectLanguage' in message) {
        chrome.tabs.detectLanguage(sender.tab.id, function (language) {
            chrome.tabs.sendMessage(sender.tab.id, {language: language});
            if (language == 'pt' && sender.tab.active) {
                updateBadgeBackground(true);
            }
        });
    }
    if (Object.keys(response).length) {
        log('Sending response:', response);
        sendResponse(response);
    }
    else log('No response sent.');
});

// load cached rules disabled sites settings
chrome.storage.local.get(['rules', 'disabled', 'options'], function (items) {
    log("Retrieved from storage:", items);
    // rules
    if (items.rules) for (var i in items.rules) rules[i] = items.rules[i];
    chrome.storage.local.set({'rules': rules});
    checkUpdateRules();
    // disabled
    if (items.disabled) disabled = items.disabled;
    activeTab(updateUI);
    // options
    if (items.options) for (var i in items.options) options[i] = items.options[i];
    if (!options.language) {
        options.language = (function () {
            var langs = navigator.languages;
            for (var i = 0; i < langs.length; i++) {
                if (/^pt-(PT|BR)$/.test(langs[i])) return langs[i];
            }
            return 'pt-PT';
        })();
    }
    chrome.storage.local.set({'options': options});
    // load dictionary
    loadDic();
});


// BROWSER ACTION AND SETTINGS

// retrieve active tab and run callback
var activeTab = function (cb) {
    chrome.tabs.query({active: true}, function (tabs) { if (tabs) cb(tabs[0]); });
};

// update button
var updateUI = function (tab) {
    log('Updating UI for: ', tab);
    chrome.browserAction.setBadgeText({text: isDisabledUrl(tab.url) ? '' : '✓'});
    chrome.browserAction.setBadgeBackgroundColor({color: '#4286f4'});
};

// update button and tab
var updateTabAndUI = function (tab) {
    updateUI(tab);
    chrome.tabs.sendMessage(tab.id, {isDisabled: isDisabledUrl(tab.url) || false})
};

// update bagde background
var updateBadgeBackground = function (isPortuguese) {
    chrome.browserAction.setBadgeBackgroundColor({color: isPortuguese ? '#248c23' : '#C4C4C4'});
}

// returns true if url is disabled in the settings
var isDisabledUrl = function (url) {
    var match = url.match(/^https?:\/\/(.+?)(\/.*)/i);
    return !match || disabled.global || disabled.domains[match[1]] || (disabled.pages[match[1]] && disabled.pages[match[1]][match[2]]);
};

// observe disabled sites settings changes
chrome.storage.onChanged.addListener(function (changes, areaName) {
    console.log('storage change:', areaName, changes);
    if (areaName == 'local') {
        if (changes.disabled) {
            disabled = changes.disabled.newValue;
            activeTab(updateTabAndUI);
        }
        if (changes.rules) rules = changes.rules.newValue;
        if (changes.options) {
            options = changes.options.newValue;
            if (options.language != changes.options.oldValue || options.spelling != changes.spelling.oldValue) {
                loadDic();
            }
        }
    }
});


// TABS

// update the button and the tab when the active tab changes
// the tab has to be updated because global or domain might have been changed in another tab
chrome.tabs.onActivated.addListener(function (activeInfo) {
    log('onActivated', activeInfo);
    activeTab(updateTabAndUI); 
});

// update the button when the page loads
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    log('onUpdated', changeInfo, tab);
    if (changeInfo.url && tab.active) updateUI(tab); // .url is set only when the url changes
});

log('Background page loaded.');



