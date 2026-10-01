// SPDX-License-Identifier: MIT
import { initialLanguage,setLanguage,applyLanguage,t } from './i18n.js';
import { Store } from './storage.js';
const store=new Store();
setLanguage(initialLanguage(store.read('settings',{}).language));
const render=()=>{applyLanguage();document.title=`${t('privacy')} — Dopa Fit`;};render();
document.getElementById('language-privacy').onchange=event=>{const language=setLanguage(event.target.value);store.write('settings',{...store.read('settings',{}),language});render();};
