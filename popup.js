document.addEventListener("DOMContentLoaded", function(e) {
    localizeHtmlPage();
    var disabled = false, domain, page;
    var globalCheck = document.getElementById("global");
    var domainCheck = document.getElementById('domain');
    var pageCheck = document.getElementById('page');
    
    var update = function () {
        updateUI();
        if (!disabled) console.log('Settings yet not loaded.');
        else {
            chrome.storage.local.set({'disabled': disabled}, function () {
                console.log('Settings saved.');
            });
        }
    };
    var updateUI = function () {
        domainCheck.parentNode.className = (domainCheck.disabled = !domain || !globalCheck.checked) ? 'disabled' : '';
        pageCheck.parentNode.className = (pageCheck.disabled = !page || !globalCheck.checked || !domainCheck.checked) ? 'disabled' : '';
    };
    
    globalCheck.addEventListener('click', function (e) {
        if (e.target.checked) delete(disabled.global);
        else disabled.global = true;
        update();
    });
    
    domainCheck.addEventListener('click', function (e) {
        if (e.target.checked) delete(disabled.domains[domain]);
        else disabled.domains[domain] = true;
        update();
    });
    
    pageCheck.addEventListener('click', function (e) {
        if (e.target.checked) {
            delete(disabled.pages[domain][page]);
            if (!Object.keys(disabled.pages[domain]).length) {
                delete(disabled.pages[domain]);
            }
        }
        else {
            if (!disabled.pages[domain]) disabled.pages[domain] = {};
            disabled.pages[domain][page] = true;
        }
        update();
    });
    
  
    // options
    var options = false;
    var accentuation = document.getElementById('accentuation');
    var abbreviations = document.getElementById('abbreviations');
    var capitalization = document.getElementById('capitalization');
    
    var updateOption = function (e) {
        if (!options) console.log('Options yet not loaded.');
        else {
            options[e.target.getAttribute('data-option')] = e.target.checked;
            console.log('New options:', options);
            chrome.storage.local.set({'options': options}, function () {
                console.log('Options saved.');
            });
        }
    };
    
    accentuation.addEventListener('click', updateOption);
    abbreviations.addEventListener('click', updateOption);
    capitalization.addEventListener('click', updateOption);
    
    document.getElementById('optionsButton').addEventListener('click', function() {
        if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
        else window.open(chrome.runtime.getURL('options.html'));
    });
    
    // initial state
    chrome.tabs.query({active: true}, function (tabs) {
        var url = tabs[0].url;
        var match = url.match(/^https?:\/\/(.+?)(\/.*)/i);
        domain = match && match[1];
        page = match && match[2];
        chrome.storage.local.get('disabled', function (items) {
            console.log('disabled:', items);
            disabled = items.disabled || {};
            if (!disabled.domains) disabled.domains = {};
            if (!disabled.pages) disabled.pages = {};
            
            if (!disabled.global) globalCheck.checked = true;
            if (domain && !disabled.domains[domain]) domainCheck.checked = true;
            if (page && (!disabled.pages[domain] || !disabled.pages[domain][page])) pageCheck.checked = true;
            updateUI();
        });
        chrome.storage.local.get('options', function (items) {
            console.log('options:', items);
            options = items.options || {accentuation: true, abbreviations: true, capitalization: true};
            if (options.accentuation) accentuation.checked = true;
            if (options.abbreviations) abbreviations.checked = true;
            if (options.capitalization) capitalization.checked = true;

        });
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
