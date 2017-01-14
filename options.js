document.addEventListener("DOMContentLoaded", function(e) {
    localizeHtmlPage();

    document.getElementById('contactForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var msgInput = document.getElementById('msg');
        var emailInput = document.getElementById('email');
        var submitButton = document.getElementById('submitButton');
        
        
        if (!msgInput.value) showMessage('messageFeedback', chrome.i18n.getMessage('enterMessageAlert'));
        else {
            submitButton.disabled = true;
            submitButton.value = chrome.i18n.getMessage('Sending') + "…";
            var xhr = new XMLHttpRequest();
            xhr.open('POST', 'http://nazigramatical.x10.bz/contact.php', true);
            xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            xhr.onreadystatechange = function () {
                if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {
                    submitButton.disabled = false;
                    submitButton.value = chrome.i18n.getMessage('Send');
                    if (xhr.responseText == 'ok') {
                        msgInput.value = '';
                        showMessage('messageFeedback', chrome.i18n.getMessage('messageSent'));
                    }
                    else                         showMessage('messageFeedback', chrome.i18n.getMessage('messageError'));
                }
            };
            xhr.send('msg=' + encodeURIComponent(msgInput.value) + '&email=' + encodeURIComponent(emailInput.value));
        }        
    });
    
    chrome.storage.local.get(['rules', 'options'], function (items) {
        console.log('Retrieved from storage:', items);
        var rules = items.rules;
        if (rules) {
            var loadRules = function (element, defaultRules, disabledRules) {
                var lines = [];
                for (var i = 0; i < defaultRules.length; i++) {
                    lines.push('<label><input type="checkbox" data-rule="' + i + '" /> ' + defaultRules[i][0] + ' ➡ ' + defaultRules[i][1] + '</label>');
                }
                // lines.sort();
                element.innerHTML = lines.join("<br>");
                var clicked = function (e) {
                    var rule = defaultRules[e.target.getAttribute('data-rule')][0];
                    if (e.target.checked && disabledRules[rule]) delete(disabledRules[rule]);
                    else disabledRules[rule] = true;
                    chrome.storage.local.set({'rules': rules}, function () { console.log('Rules saved.'); });
                };
                var checkboxes = element.querySelectorAll('input');
                for (var i = 0; i < checkboxes.length; i++) {
                    checkboxes[i].addEventListener('click', clicked);
                    if (!disabledRules[defaultRules[checkboxes[i].getAttribute('data-rule')][0]]) checkboxes[i].checked = true;
                }
            };
            // abbreviations
            if (rules.abbrs) {
                loadRules(document.getElementById('abbrs'), rules.abbrs, rules.disabledAbbrs);
            }
            // rules
            if (rules.rules) {
                loadRules(document.getElementById('rules'), rules.rules, rules.disabledRules);
            }
        }
        
        // custom abbreviations
        document.getElementById('customRules').value = rules.customRules.map(function (rule) { return rule[0] + ' '.repeat(Math.max(2, 10 - rule[0].length)) + rule[1] }).join("\n") + "\n";
        document.getElementById('saveCustomRules').addEventListener('click', function () {
            var list = document.getElementById('customRules').value.split("\n");
            var customRules = [], errors = [];
            for (var i = 0; i < list.length; i++) {
                var error = '';
                if (list[i].match(/^\s*$/)) continue;
                var match = list[i].match(/^\s*(.+?)  +(.*?)\s*$/) || list[i].match(/^\s*(.+?) +(.*?)\s*$/);
                if (match) {
                    try {
                        new RegExp(match[1]);
                        customRules.push([match[1], match[2]]);
                        continue;
                    }
                    catch (e) { error = e.message; }
                }
                else error = chrome.i18n.getMessage('noReplacementError');
                errors.push(chrome.i18n.getMessage('Line') + ' ' + (i + 1) + ': ' + list[i] + '\n' + error);
            }
            if (errors.length) alert(chrome.i18n.getMessage('rulesError', [errors.join("\n\n")]));
            showMessage('customRulesSaved');
            rules.customRules = customRules;
            console.log('customRules:', rules.customRules);
            chrome.storage.local.set({'rules': rules}, function () { console.log('Rules saved.'); });
        });
        
        var options = items.options;
        if (options) {
            // language
            var languageSelect = document.getElementById('language');
            var languageSelected = function () {
                options.language = languageSelect.options[languageSelect.selectedIndex].value;
                if (options.language == 'pt-BR') {
                    if (options.spelling == 1) spellingSelect.selectedIndex = 0;
                    spellingSelected();
                    spellingSelect.options[1].disabled = true;
                }
                else {
                    spellingSelect.options[1].disabled = false;
                    chrome.storage.local.set({'options': options}, function () { console.log('Options saved.'); });
                    showMessage('languageSaved');
                }
            };
            var spellingSelect = document.getElementById('spelling');
            var spellingSelected = function () {
                options.spelling = spellingSelect.selectedIndex;
                chrome.storage.local.set({'options': options}, function () { console.log('Options saved.'); });
                showMessage('languageSaved');
            };
            languageSelect.addEventListener('change', languageSelected);
            languageSelect.options[options.language == 'pt-BR' ? 1 : 0].selected = true;
            spellingSelect.addEventListener('change', spellingSelected);
            spellingSelect.selectedIndex = options.spelling;
            spellingSelect.options[1].disabled = options.language == 'pt-BR';
        }
    });    
});

function localizeHtmlPage() {
    var html = document.getElementsByTagName('html')[0];
    var valStrH = html.innerHTML.toString();
    var valNewH = valStrH.replace(/__MSG_(\w+)__/g, function(match, v1) {
        return v1 ? chrome.i18n.getMessage(v1) : "";
    });
    if(valNewH != valStrH) html.innerHTML = valNewH;
}

    
// feedback when user changes settings
var messageTimers = {};
var showMessage = function (elementId, text) {
        var element = document.getElementById(elementId);
        if (text) element.innerText = text;
        element.style.display = '';
        if (messageTimers[elementId]) clearInterval(messageTimers[elementId]);
        messageTimers[elementId] = setTimeout(function () { element.style.display = 'none'; }, 2500);

};