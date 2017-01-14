// fix-me: contra-ordenacao
(function() {
    'use strict';

    var parsedRules = false;
    var parsedAbbrs = false;
    var lastReplace = null;
    var dicWordsCache = {};
    var dic = null;
    var dicLoaded = false;
    var lastCheck = 0;
    var disabled = false;
    var isDisabled = false;
    var isDisabledTemp = false;
    var detectedPT = null; // must be null
    var detectedPTChrome = false;
    var messageSentTime;
    var inited = false;
    var initing = false;
    var options = false;

    // var log = console.log.bind(console);
    var log = function () { };
    
    
    var sendMessage = function (message, cb) {
        log('sending message:', message);
        messageSentTime = Date.now();
        chrome.runtime.sendMessage(message, function (response) {
            if (response) handleMessage(response);
            if (cb) cb(response);
        });
    };
    
    var handleMessage = function (message, sender) {
        log('Message received from:', sender , ':', message);
        if ('isDisabled' in message) {
            isDisabled = isDisabledTemp || message.isDisabled;
            log('Is disabled:', isDisabled);
        }
        if (message.language) {
            log('Chrome detected language:', message.language);
            if (message.language == 'pt') detectedPTChrome = true;
        }
        if (message.dic) {
            dic = message.dic;
            dicLoaded = true;
            log('Loaded dic in ' + (Date.now() - messageSentTime) + ' ms. (' + message.dic.length + ' bytes)');

        }
        if (message.rules || message.parsedRules) {
            // log('Rules to load:', message.parsedRules || message.rules);
            if (message.parsedRules) {
                parsedRules = unserializeRules(message.parsedRules);
            }
            else if (message.rules) {
                parsedRules = parseRules(message.rules);
            }
            loadStaticRules();
            // log('Parsed Rules:', parsedRules);
            if (message.abbrs) parsedAbbrs = parseRules(message.abbrs);
            log('Parsed Abbrs:', parsedAbbrs);
        }
    };
    
    // listen for settings changes for this page
    chrome.runtime.onMessage.addListener(handleMessage);

    var init = function () {
        // lock
        if (initing) return;
        initing = true;
        
        log('Init spell checker...');
        sendMessage({
            getDic: null,
            getRules: null,
            detectLanguage: null,
            isDisabled: /^https?/.test(location.href) ? location.href : parent.location.href
        }, function (response) {
            inited = true;
        });
    };
    
    var loadDic = function () {
        sendMessage({getDic: null});
    };

    var dicWordExistsCS = function (word) {
        var time = Date.now();
        var result;
        if (dicWordsCache[word] !== undefined) result = dicWordsCache[word];
        else {
            result = (dic.indexOf("\n" + word + "\n") != -1);
        }
        log('Dic search: ' + word + ' Time: ' + (Date.now() - time) + ' ms. Result: ' + result);
        return result;
    };
    var dicWordExists = function (word) {
        if (dicWordExistsCS(word)) return true;
        var wordLC = word.toLowerCase();
        return word != wordLC && dicWordExistsCS(wordLC);
    };

    var dicCheckSentence = function (str) {
        var words = str.match(/[a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]{3,}/g);
        if (words) {
            for (var i = 0; i < words.length; i++) {
                if (!dicWordExists(words[i])) return false;
            }
        }
        return true;
    };

    var replaceMultiple = function (str, a, b) {
        for (var i = 0; i < a.length; i++) str = str.replace(a[i], b[i]);
        return str;
    };

    var regexGroups = function (regex) {
        return regex
            .replace(/\\pL/g, '[a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]')
            .replace(/\\pBL/g, '(?<=^|[^a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ])')
            .replace(/\\pBR/g, '(?=$|[^a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ])')
            .replace(/\\pV/g, '[aeiouáâãéêíóôõúÁÂÃÉÊÍÓÔÕÚ]')
            .replace(/\\pVE/g, '(?:e|é|ê)')
            .replace(/\\pC/g, '[b-df-hj-np-tv-zçÇ]')
            .replace(/\\pNUM/g, '(?:[0-9]+(?:[,.][0-9]+)?|uma?|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quinze|dezasseis|dezassete|dezoito|dezanove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novezentos|mil)');
    };

    var parseRules = function (rules) {
        var parsedRules = [];
        for (var i = 0; i < rules.length; i++) {
            var rule = regexGroups(rules[i][0].toString());
            var replace = (typeof rules[i][1] == 'string') ?
                '$1' + rules[i][1].replace(/\$(\d+)/g, function (match, p1) { return '$' + (Number(p1) + 1); }) :
            (function (cb) {
                return (function () {
                    var args = [];
                    for (var i = 0; i < arguments.length; i++) args.push(arguments[i] ? arguments[i] : '');
                    var r = cb([args[1] ? args[0].substr(1) : args[0]].concat(args.slice(2, -2)));
                    return r ? args[1] + r : '';
                });
            })(rules[i][1]);
            var flags = '';
            var regs = rule.match(/^\/(.+)\/(.*?)$/);
            if (regs) {
                rule = regs[1];
                flags = regs[2];
            }
            var regs = rule.match(/^\(\?<([!=])(.+?)\)(.+)/);
            if (regs) {
                //log('Lookbehind rule:', rule);
                if (regs[1] == '=') rule = '(^|[^a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]|'+regs[2]+')' + regs[3] + '(?=[^]$)';
                if (regs[1] == '!') {
                    if (/[^a-zA-Z0-9 ]/.test(regs[2])) {
                        log('Ignored imparsable rule with lookbehind:', rule);
                        continue;
                    }
                    rule = '(?!'+ regs[2] +')(.{'+regs[2].length+'}|^.{0,'+(regs[2].length-1)+'})' + regs[3] + '(?=[^]$)';
                }
                //log('Lookbehind rule parsed:', rule);
            }
            else if (/\(\?</.test(rule)) {
                //log('Ignored rule with lookbehind:', rule);
                continue;
            }
            else rule = '(^|[^a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ])' + rule + '(?=[^]$)';
            if (!flags) flags = 'i';
            try {
                parsedRules.push([new RegExp(rule, flags), replace]);
            } catch (e) { log('Error parsing rule:' + rule, e); }
        }
        //log("ParsedRules: ", parsedRules);
        return parsedRules;
    };

    var isPortuguese = function (text) {
        var words = text.match(/[a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]{2,}/g);
        // var wordsLength = 0;
        var wordsPt = 0;
        // var wordsPtLength = 0;
        if (words) {
            words = words.slice(-10);
            for (var i = 0; i < words.length; i++) {
                if (dicWordExists(words[i])) {
                    wordsPt++;
                    // wordsPtLength += words[i].length;
                }
                // wordsLength += words[i].length;
            }
            // log("Portuguese words: " + wordsPt + " Total words: " + words.length + " Portuguese Ratio: "+(wordsPt / words.length));
            // log("Portuguese chars: " + wordsPtLength + " Total chars: " + wordsLength + " Portuguese Ratio: "+(wordsPtLength / wordsLength));
            // return wordsPtLength / wordsLength >= .75;
            return wordsPt / words.length >= .75;
        }
        // if there is no text we assume the page's language or last detected language
        return detectedPT === null ? detectedPTChrome : detectedPT;
    };

    var checkLanguage = function (fullText) {
        var text = fullText
            .replace(/https?:\/\/[^ )]+/g, '')
            .replace(/[ru]\/[a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ0-9_-]+/g, '')
            .replace(/«.+?»/g, '')
            .replace(/".+?"/g, '')
            .replace(/\*\*(.+?)\*\*/g, '$1') // remove bold
            .replace(/\*.+?\*/g, '')
            .replace(/[a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ-]+[^]$/, ''); // remove last word (including compound words)
        // get last 10 words longer than 2 chars
        var match = text.match(/([a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]+[^a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]+([a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]{1,1}[^a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]+)?){0,10}$/);
        text = match[0];
        var result = isPortuguese(text);
        detectedPTUpdate(result);
        return result;
    };
    
    // update browser action badge color when detected language changes
    var detectedPTUpdate = function (result) {
        if (result !== detectedPT) {
            sendMessage({isPortuguese: result});
            detectedPT = result;
        }
    };

    // apply every rule to the line
    var scanLine = function (line) {
        var scanLineRules = function (line, rules) {
            var result = '';
            for (var i = 0; i < rules.length; i++) {
                result = checkWord(line, rules[i][0], rules[i][1]);
                if (result) return result;
            }
        };
        var result = '';
        if (options.abbreviations && parsedAbbrs) result = scanLineRules(line, parsedAbbrs);
        if (!result) result = scanLineRules(line, parsedRules);
        
        // compound word
        // hyphen doesn't trigger a check so we check compound words at once (now)
        var match = (result || line).match(/^(.+-)([a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ]+[^])$/);
        if (match) {
            var result2 = scanLine(match[1]); // recursion
            if (result2) result = result2 + match[2];
        }
        if (result) log('Spell check: "' + line + '" -> "' + result + '"');
        return result;
    };

    // apply a rule to the line
    var checkWord = function (line, regex, replace) {
        // log("Line: '"+line+"' Regex: "+regex+" Replace: "+replace);
        if (regex.test(line)) {
            var match = line.match(regex);
            var index = match.index ? match.index + 1 : 0;
            var replaced = line.replace(regex, replace).slice(index, -1);
            //log(`replaced: '${replaced}'`);
            if (replaced) {
                log("Line: '"+line+"'");
                log("Regex: "+regex+" Replace: "+replace+" Match:", match);
                replaced = fixCase(line.slice(index, -1), replaced);
                log(`replaced: '${replaced}'`);
                //log('check correction:', dicCheckSentence(replaced));
                return line.slice(0, index) + replaced + line.slice(-1);
            }
        }
    };

    // apply the case of the first string to the second string
    var fixCase = function (str1, str2) {
        // log(`fixCase: "${str1}" "${str2}"`);
        var isUpperCase = function (s) { return s == s.toUpperCase(); };
        var isLowerCase = function (s) { return s == s.toLowerCase(); };
        var toTitleCase = function (s) { return s.charAt(0).toUpperCase() + s.substr(1); }; // it only changes the first letter
        var isTitleCase = function (s) { return s.charAt(0) == s.charAt(0).toUpperCase(); }; // it only checks the first letter

        if (isLowerCase(str1)) return options.capitalization ? str2 : str2.toLowerCase();
        if (isUpperCase(str1)) return str2.toUpperCase();
        if (isTitleCase(str1)) return toTitleCase(str2);
        return str2;
    };

    var removeDiacritics = function (str) {
        (function(a, b) { for (var i = 0; i < a.length; i++) str = str.replace(new RegExp(a[i], 'g'), b[i]); })(
            ['á', 'â', 'é', 'ê', 'í', 'ó', 'ô', 'ú', 'Á', 'Â', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Ú'],
            ['a', 'a', 'e', 'e', 'i', 'o', 'o', 'u', 'A', 'A', 'E', 'E', 'I', 'O', 'O', 'U']);
        return str;
    };

    var tryCorrection = function (w1, w2) {
        // log(`tryCorrection "${w1}" "${w2}"`);
        if (!dicWordExists(w1) && dicWordExists(w2)) return w2;
    };
    
    var InputData = function (input) {
        if ('value' in input) {
            this.getText = function () { return input.value; };
            this.setText = function (text) { input.value = text; };
            this.getCursorPosition = function () { return input.selectionEnd; };
            this.setCursorPosition = function (position) { input.selectionEnd = position; };
        }
        else {
            var selection = input.ownerDocument.getSelection();
            var range = selection.getRangeAt(0);
            this.range = {startContainer: range.startContainer, startOffset: range.startOffset, endContainer: range.endContainer, endOffset: range.endOffset};

            this.getText = function () { return this.range.endContainer.nodeValue || ''; };
            this.setText = function (text) { this.range.endContainer.nodeValue = text; };
            this.getCursorPosition = function () { return this.range.endOffset; };
            this.setCursorPosition = function (position) {
                var selection = input.ownerDocument.getSelection();
                selection.removeAllRanges();
                var newRange = document.createRange();
                newRange.setStart(this.range.startContainer, position);
                newRange.setEnd(this.range.endContainer, position);
                selection.addRange(newRange);
            };
        }
        this.text = this.getText();
        this.cursorPosition = this.getCursorPosition();
        this.left = this.text.substr(0, this.cursorPosition);
        this.right = this.text.substring(this.cursorPosition, this.text.length);
    };
    
    var spellCheck = function (left) {
        log('spellcheck: "' + left + '"');
        if (/[a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ-]$/.test(left)) return; // we're in the middle of a word
        
        var leftLines = left.match(/.+(\n+|$)/g); // lines before current line
        var line = leftLines.pop(); // current line FIXME: error when using delete with cursor at 0
        
        if (/^ *>/.test(line)) return; // quote
        if (/https?:\/\/[^ )]+[^]$/.test(line)) return; // url
        if (/[ru]\/[a-zA-ZáâãéêíóôõúüçÁÂÃÉÊÍÓÔÕÚÜÇ0-9_-]+[^]$/.test(line)) return; // users/subs
        if (/«[^»]+[^]$/.test(line)) return; // quote
        if (/^[^"]*"[^"]*([^"]*"[^"]*"[^"]*)*[^]$/.test(line)) return; // quote
        if (/^[^*]*\*[^*]*([^*]*\*[^*]*\*[^*]*)*[^]$/.test(line.replace(/\*\*.+?\*\*/g, ''))) return; // italic
        
        if (!checkLanguage(left)) return;
        
        if ((line = scanLine(line))) {
            leftLines.push(line);
            left = leftLines.join('');
            return left;
        }
    };
    
    document.addEventListener('input', function (e) {
        // log('input', e);
        if (isDisabled) return;
        var input = e.target;
        if (input.getAttribute('autocomplete') == 'off') return;
        var inputData = new InputData(input);
        // log('text.length:', inputData.text.length);
        // log(inputData.text, inited, dicLoaded);
        if (!inputData.text) return; // no text
        lastCheck = Date.now(); // prevent cleanup
        if (!inited) return init(); // async (implies dic not loaded)
        if (!dicLoaded) return loadDic(); // dic was unloaded meanwhile
        var left = spellCheck(inputData.left);
        if (left) {
            lastReplace = {left: left, initialLeft: inputData.left, initialText: inputData.text, initialCursorPosition: inputData.cursorPosition, time: Date.now()};
            inputData.setText(left + inputData.right);
            inputData.setCursorPosition(left.length);
        }
    });

    // ctrl+z or backspace
    document.addEventListener('keydown', function(e) {
        // log('keydown', e);
        if (e.ctrlKey ? e.keyCode == 90 : e.keyCode == 8) { // ctrl+z || backspace
            if (lastReplace) {
                if (lastReplace.time < Date.now() - 5000) {
                    log("Ignoring undo: last correction was too long ago.");
                    lastReplace = null;
                }
                else {
                    var inputData = new InputData(e.target);
                    var undo = function (text, cursorPosition) {
                        log('Undoing: "'+inputData.text+'" -> "'+text+'".');
                        inputData.setText(text);
                        inputData.setCursorPosition(cursorPosition);
                        lastReplace = null;
                        e.preventDefault();
                    };
                    if (e.ctrlKey) undo(lastReplace.initialText, lastReplace.initialCursorPosition);
                    else if (lastReplace.left == inputData.left) {
                        undo(lastReplace.initialLeft.slice(0, -1) + inputData.right, lastReplace.initialCursorPosition - 1);
                    }
                }
            }
        }
    });

    // static rules
    var loadStaticRules = function () {
        var rules = [
            [/(\pL*[áâéêíóôú]\pL*)(mente|zinh[ao]s?)/, function (r) { return removeDiacritics(r[1]) + r[2]; }], //sózinho, sómente
            [/(in)?d([ei])s(\pL{3,})/, function (r) { return tryCorrection(r[0], r[1] + (r[2] == 'e' ? 'dis' : 'des') + r[3]); }], //destraído, distoar
            [/(\pL+i)ss(es?)/, function (r) { return tryCorrection(r[0], r[1]+'c'+r[2]); }], //chatisse
            [/(\pL*[aeiou])([íú])([zlr])/, function (r) { return tryCorrection(r[0], r[1]+removeDiacritics(r[2])+r[3]); }], //saír
            [/(\pL*)([áâéêíóôú])([zlr])/, function (r) { return tryCorrection(r[0], r[1]+removeDiacritics(r[2])+r[3]); }], //metêr, cristál
            [/(\pL*[^aeiou])([áéíóúâêô])(\pC+[aeo](?:s|m|ns)?)/, function (r) { return tryCorrection(r[0], r[1]+removeDiacritics(r[2])+r[3]); }], //fála, páras
            [/(\pL*[^aeiou])([íú])(s|m|ns)?/, function (r) { return tryCorrection(r[0], r[1]+removeDiacritics(r[2])+r[3]); }], //perú, patíns
            //[/([aeiou])([iu]?\pC+[aeiou][oea]s?)/, function (r) { return tryCorrection(r[0], r[1]+removeDiacritics(r[2])+r[3]); }],
            [/(\pL+)a([eo]s?)/, function (r) { return tryCorrection(r[0], r[1]+'ã'+r[2]); }], //mao, mae, maos, maes
            [/(\pL+)o(es?)/, function (r) { return tryCorrection(r[0], r[1]+'õ'+r[2]); }], //poe, poes
            [/(\pL+)c[aã]([eo]s?)/, function (r) { return tryCorrection(r[0], r[1]+'çã'+r[2]); }], //bêncao, bêncão, bêncaos, bêncãos, opcoes, opcões
            [/(\pL+)c[oõ](es?)/, function (r) { return tryCorrection(r[0], r[1]+'çõ'+r[2]); }], //licoes, licões,
            [/(\pL*\pV)[cp]([cçt]\pV\pL*)/, function (r) { return tryCorrection(r[0], (r[1] + r[2]).replace(/m(?=[cçt])/i, 'n')); }], // inflacção
            [/(\pL*)~e(\pL*)/, function (r) { return tryCorrection(r[0], r[1] + 'ê' + r[2]); }], // t~em
            // enclise
            [/(((\pL+)([aeiouô]))([srz]))-([oa]s?)(?!-)/, function (r) {
                if (dicWordExists(r[1])) {
                    var replace = '';
                    if (r[1] == 'quer') replace = 'quere-' + r[6];
                    else if (r[5] == 's') {
                        replace = r[2] + '-l' + r[6];
                    }
                    else {
                        replace = r[3] + r[4].replace('a', 'á').replace('e', 'ê').replace('o', 'ô') + '-l' + r[6];
                    }
                    return replace;
                }
            }],
            // dehyphenate
            [/(\pL{2,}?)(s?)-(\pL+)/, function (r) {
            var match;
                if (!dicWordExists(r[1] + r[2]) || !dicWordExists(r[3])) {
                    var left = r[1].slice(0, -1) + removeDiacritics(r[1].slice(-1)) + r[2];
                    var word = left + (/[aeiou]$/i.test(left) && /^[sr][aeiouáâãéêíóôõú]/i.test(r[3]) ? r[3].replace(/^([sr])/, '$1$1') : r[3]);
                    if (dicWordExists(word)) return word;
                }
                else if (
                    // pos-AO90
                    (options.spelling == 2 && (
                        (/^(aero|agro|ante|anti|arqui|auto|bio|contra|eletro|entre|extra|geo|hidro|hiper|infra|inter|intra|macro|maxi|micro|mini|multi|neo|pluri|proto|pseudo|retro|semi|sobre|sub|super|supra|tele|ultra)$/i.test(r[1]+r[2]) && !/^[h]/i.test(r[3]) && (r[1]+r[2]).slice(-1).toLowerCase() != r[3][0].toLowerCase()) ||
                        (/^(des|in)$/i.test(r[1]+r[2]) && (r[1]+r[2]).slice(-1).toLowerCase() != r[3][0].toLowerCase()) ||
                        (/^(circum|pan)$/i.test(r[1]+r[2]) && !/^[hmnaeiouáâãéêíóôõú]/i.test(r[3])) ||
                        (/^co$/i.test(r[1]+r[2]) && !/^[h]/i.test(r[3])))) ||
                    // pre-AO90
                    (options.spelling != 2 && (
                        (/^(auto|contra|extra|infra|intra|neo|proto|pseudo|supra|ultra)$/i.test(r[1]+r[2]) && !/^[hrsaeiouáâãéêíóôõú]/i.test(r[3])) ||
                        (/^(anti|arqui|semi)$/i.test(r[1]+r[2]) && !/^[iíhrs]/i.test(r[3])) ||
                        (/^(ante|entre|sobre)$/i.test(r[1]+r[2]) && !/^h/i.test(r[3])) ||
                        (/^(hiper|inter|super)$/i.test(r[1]+r[2]) && !/^[hr]/i.test(r[3])) ||
                        (/^(com|mal)$/i.test(r[1]+r[2]) && !/^[aeiouáâãéêíóôõúh]/i.test(r[3])) ||
                        (/^pan$/.test(r[1]+r[2]) && !/^[haeiouáâãéêíóôõú]/i.test(r[3])) ||
                        (/^circum$/.test(r[1]+r[2]) && !/^[hmnaeiouáâãéêíóôõú]/i.test(r[3]))))
                ) {
                    log('dehyphenate', match);
                    var dehyphenate = function (left, right) {
                        if (right[0] == 'h') return left + right.slice(1);
                        return left + right.replace(/^([sr])/, '$1$1');
                    };
                    var word = dehyphenate(r[1]+r[2], r[3]);
                    if (dicWordExists(word)) return word;
                }
            }],
            // hei-de
            [/(hei|hás|há|hão)([- ])(de)/, function (r) {
                if (options.spelling == 1) {
                    if (r[2] == ' ' && options.language == 'pt-PT') return r[1] + '-' + r[3];
                }
                else if (r[2] == '-' && (options.spelling || options.language == 'pt-BR')) return r[1] + ' ' + r[3];
            }],
            // brute force
            [/(\pL+)/, function (r) {
                if (!dicWordExists(r[0])) {
                    // hyphenate
                    var hyphenate = function (word) {
                        var match;
                        if (options.spelling == 2 && (
                            ((match = word.match(/^(aero|agro|ante|anti|arqui|auto|bio|contra|eletro|entre|extra|geo|hidro|hiper|infra|inter|intra|macro|maxi|micro|mini|multi|neo|pluri|proto|pseudo|retro|semi|sobre|sub|super|supra|tele|ultra)(.+)$/)) && (/^[h]/i.test(match[2]) || (match[1].slice(-1).toLowerCase() == match[2][0].toLowerCase()))) ||
                            ((match = word.match(/^(ex|sota|soto|vice|vizo)(.+)$/))) ||
                            ((match = word.match(/^(circum|pan)(.+)$/)) && /^[hmnaeiouáâãéêíóôõú]/i.test(match[2])) ||
                            ((match = word.match(/^(pós|pré|pró)(.+)$/)))
                        )) {
                                if (dicWordExists(match[2])) return match[1] + '-' + match[2];
                        }
                    };
                    var result = hyphenate(r[0]);
                    if (result) return result;
                    
                    // accentuation & capitalization
                    if (options.accentuation || options.capitalization) {
                        var time = Date.now();
                        var rule = options.accentuation ?
                            replaceMultiple(r[0], [/[aáâã]/gi, /[eéê]/gi, /[ií]/gi, /[oóôõ]/gi, /[uúü]/gi, /c/gi], ['[aáâã]', '[eéê]', '[ií]', '[oóôõ]', '[uúü]', '[cç]']) : r[0];
                        var regex = new RegExp('\\n' + rule + '\\n', 'gi');
                        var match = dic.match(regex);
                        log('Possible matches:', match, 'Time took:', Date.now() - time);
                        if (match) {
                            var result;
                            if (match.length == 1) result = match[0].replace(/\n/g, '');
                            else if (match.length == 2 && match[0].toLowerCase() == match[1].toLowerCase()) {
                                result = match[1].replace(/\n/g, '');
                            }
                            // don't correct AO90 changes
                            if (options.language != 'pt-BR' || options.spelling || (result && result != replaceMultiple(r[0], [/éi(?!s?$)/i, /ói(?!s?$)/i, /ôo/i, /êe/i, /([ae])iú/i, /ü/gi], ['ei', 'oi', 'oo', 'ee', '$1iu', 'u']))) {
                                return result;
                            }
                        }
                    }
                }
            }]
        ];
        parsedRules = parsedRules.concat(parseRules(rules));
    };

    // clean dictionary when it's not needed anymore
    setInterval(function () {
        if (dic && Date.now() - lastCheck > 55000) {
            log('Unloaded dic.');
            dic = null;
            dicLoaded = false;
        }
    }, 60000);
    
    // retrieve and observe storage
    chrome.storage.local.get('options', function (items) { options = items.options; });
    chrome.storage.onChanged.addListener(function (changes, areaName) {
    log('storage change:', areaName, changes);
    if (areaName == 'local' && changes.options) {
        options = changes.options.newValue;
    }
});

})();