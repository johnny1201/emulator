
/*
 app.js — Advanced save manager for EmulatorJS-based PS1 player.
 - Uses EmulatorJS via CDN.
 - ROM is loaded locally (Blob URL).
 - Memory card (.mcr) import/export handled via file input and download.
 - Save states exported/imported as files (.state).
 - Autosave generates a .mcr blob for manual upload (no server).

 Note: Some emulator builds expose postMessage API to import/export memory cards.
 This script attempts postMessage first; if emulator is same-origin it will call functions directly.
*/

(function(){
  const romInput = document.getElementById('romInput');
  const romName = document.getElementById('romName');
  const gameContainer = document.getElementById('game');
  const log = document.getElementById('log');

  const mcrImport = document.getElementById('mcrImport');
  const btnImport = document.getElementById('btnImport');
  const btnExport = document.getElementById('btnExport');
  const btnAutoSave = document.getElementById('btnAutoSave');
  const mcrSlotsDiv = document.getElementById('mcrSlots');

  const stateSlotsDiv = document.getElementById('stateSlots');
  const saveStateBtn = document.getElementById('saveStateBtn');
  const loadStateBtn = document.getElementById('loadStateBtn');
  const stateNameInput = document.getElementById('stateName');
  const stateImport = document.getElementById('stateImport');

  // simple slots UI for memory cards
  const SLOT_COUNT = 4;
  let selectedSlot = 1;
  let slotFiles = Array(SLOT_COUNT+1).fill(null); // store ArrayBuffer of .mcr
  let lastMcrBuffer = null;
  let lastRomBlobUrl = null;

  function appendLog(...args){ log.innerText = args.join(' '); console.log(...args); }

  function buildSlots(){
    mcrSlotsDiv.innerHTML = '';
    for(let i=1;i<=SLOT_COUNT;i++){
      const btn = document.createElement('button');
      btn.innerText = 'Slot ' + i;
      btn.dataset.slot = i;
      if(i===selectedSlot) btn.style.outline = '2px solid #4caf50';
      btn.onclick = ()=>{ selectedSlot = i; buildSlots(); updateExportButton(); };
      mcrSlotsDiv.appendChild(btn);
    }
    updateExportButton();
  }

  function updateExportButton(){
    btnExport.disabled = !slotFiles[selectedSlot];
  }

  buildSlots();

  // STATE slots UI
  function buildStateUI(){
    stateSlotsDiv.innerHTML = '<p>States salvos são armazenados localmente como arquivo .state que você pode baixar e guardar no Drive.</p>';
  }
  buildStateUI();

  // ROM load handler
  romInput.addEventListener('change', async (e)=>{
    const f = e.target.files[0];
    if(!f) return;
    romName.innerText = 'ROM: ' + f.name;
    const ab = await f.arrayBuffer();
    const blob = new Blob([ab]);
    lastRomBlobUrl = URL.createObjectURL(blob);

    // configure EmulatorJS globals
    window.EJS_player = '#game';
    window.EJS_core = 'psx';
    window.EJS_gameUrl = lastRomBlobUrl;
    window.EJS_pathtodata = 'https://cdn.emulatorjs.org/latest/';
    window.EJS_gameID = 'hmbtn-'+Date.now();

    appendLog('Inicializando emulador com ROM', f.name);

    // start emulator if available
    if(typeof window.EJS_start === 'function'){
      try{ window.EJS_start(); appendLog('EJS_start chamado.'); }
      catch(e){ appendLog('EJS_start falhou:', e); }
    } else {
      appendLog('EJS_start não definido ainda. Tentando criar script dinamicamente e aguardar inicialização...');
      // wait for emulator.js to define EJS_start
      let tries = 0;
      const wait = setInterval(()=>{
        tries++;
        if(typeof window.EJS_start === 'function'){
          clearInterval(wait);
          try{ window.EJS_start(); appendLog('EJS_start chamado após espera.'); }
          catch(e){ appendLog('EJS_start erro pós espera', e); }
        } else if(tries>30){
          clearInterval(wait);
          appendLog('EJS_start não apareceu. Verifique se emulator.js foi carregado do CDN ou se há bloqueio de scripts.');
        }
      }, 500);
    }
  });

  // import .mcr into selected slot (store in slotFiles)
  btnImport.addEventListener('click', async ()=>{
    const f = mcrImport.files[0];
    if(!f){ alert('Escolha um arquivo .mcr primeiro'); return; }
    const ab = await f.arrayBuffer();
    slotFiles[selectedSlot] = ab;
    appendLog('Importado .mcr para slot', selectedSlot);
    updateExportButton();
    // try to inject into emulator via postMessage
    tryInjectMcrToEmu(ab);
  });

  // export selected slot -> download
  btnExport.addEventListener('click', ()=>{
    const ab = slotFiles[selectedSlot];
    if(!ab){ alert('Nenhum .mcr no slot selecionado'); return; }
    const blob = new Blob([ab], {type:'application/octet-stream'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'memorycard_slot'+selectedSlot+'.mcr';
    document.body.appendChild(a); a.click(); a.remove();
    appendLog('Exportado .mcr do slot', selectedSlot);
  });

  // autosave: try to request memory card from emulator and save as file
  btnAutoSave.addEventListener('click', async ()=>{
    appendLog('Tentando exportar memory card do emulador...');
    const exported = await tryRequestMcrFromEmu();
    if(exported){
      const blob = new Blob([exported], {type:'application/octet-stream'});
      const name = 'autosave_'+(new Date()).toISOString().replace(/[:.]/g,'-')+'.mcr';
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove();
      appendLog('Memory card exportado:', name);
    } else {
      // fallback: if we have an imported slot, offer that
      if(slotFiles[selectedSlot]){
        const blob = new Blob([slotFiles[selectedSlot]], {type:'application/octet-stream'});
        const name = 'fallback_slot'+selectedSlot+'_'+(new Date()).toISOString().replace(/[:.]/g,'-')+'.mcr';
        const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove();
        appendLog('Exportado backup do slot', selectedSlot);
      } else {
        appendLog('Falha: emulador não respondeu e nenhum slot possui .mcr.');
        alert('Não foi possível exportar memory card do emulador. Use import para fornecer um .mcr ou verifique suporte do core.');
      }
    }
  });

  // Save State: request emulator to create state and then download it (postMessage)
  saveStateBtn.addEventListener('click', async ()=>{
    const name = stateNameInput.value.trim() || ('state_'+Date.now());
    appendLog('Requisitando save state para o emulador:', name);
    const state = await tryRequestStateFromEmu();
    if(state){
      const blob = new Blob([state], {type:'application/octet-stream'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name+'.state'; document.body.appendChild(a); a.click(); a.remove();
      appendLog('State salvo:', name+'.state');
    } else {
      alert('Não foi possível gerar state a partir do emulador (core pode não suportar API).');
    }
  });

  loadStateBtn.addEventListener('click', async ()=>{
    const f = stateImport.files[0];
    if(!f){ alert('Escolha um arquivo .state'); return; }
    const ab = await f.arrayBuffer();
    const ok = await tryInjectStateToEmu(ab);
    if(ok) appendLog('State injetado no emulador.');
    else alert('Falha ao injetar state: core pode não suportar API.');
  });

  // attempt to inject MCR into emulator via postMessage or direct API
  async function tryInjectMcrToEmu(arrayBuffer){
    try {
      // postMessage protocol used by some builds
      if(window.frames.length){
        for(const fr of window.frames){
          try{
            fr.postMessage({type:'import-mcr', base64:arrayBufferToBase64(arrayBuffer)}, '*');
          }catch(e){}
        }
      }
      // direct API (same origin)
      if(window.EJS_importMcr && typeof window.EJS_importMcr === 'function'){
        window.EJS_importMcr(arrayBuffer);
        appendLog('Importado via EJS_importMcr API.');
        return true;
      }
    } catch(e){ console.warn(e); }
    appendLog('Tentativa de injeção concluída (pode ou não ter funcionado dependendo do core).');
    return false;
  }

  // attempt to request mcr from emulator
  async function tryRequestMcrFromEmu(){
    // Try calling API if present
    try {
      if(window.EJS_exportMcr && typeof window.EJS_exportMcr === 'function'){
        const ab = await window.EJS_exportMcr();
        appendLog('Obtido mcr via EJS_exportMcr');
        return ab;
      }
    } catch(e){ console.warn(e); }
    // Fallback: postMessage request and wait for response
    return await postMessageRequest('request-mcr', 'export-mcr', 3000);
  }

  // try request state
  async function tryRequestStateFromEmu(){
    return await postMessageRequest('request-state', 'export-state', 5000);
  }
  async function tryInjectStateToEmu(arrayBuffer){
    // try direct API
    try{
      if(window.EJS_importState && typeof window.EJS_importState === 'function'){
        await window.EJS_importState(arrayBuffer);
        return true;
      }
    }catch(e){}
    // postMessage fallback
    try{
      if(window.frames.length){
        for(const fr of window.frames){
          fr.postMessage({type:'import-state', base64:arrayBufferToBase64(arrayBuffer)}, '*');
        }
        return true;
      }
    }catch(e){}
    return false;
  }

  // helper: postMessage request/response
  function postMessageRequest(requestType, responseType, timeout=3000){
    return new Promise((resolve)=>{
      let settled = false;
      function handler(ev){
        const d = ev.data || {};
        if(d && d.type === responseType && d.base64){
          const ab = base64ToArrayBuffer(d.base64);
          settled = true;
          window.removeEventListener('message', handler);
          resolve(ab);
        }
      }
      window.addEventListener('message', handler);
      // send request to child frames
      if(window.frames.length){
        for(const fr of window.frames){
          try{ fr.postMessage({type:requestType}, '*'); }catch(e){}
        }
      }
      setTimeout(()=>{ if(!settled){ window.removeEventListener('message', handler); resolve(null); } }, timeout);
    });
  }

  // utilities
  function arrayBufferToBase64(buffer){
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for(let i=0;i<len;i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function base64ToArrayBuffer(base64){
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for(let i=0;i<len;i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // listen for messages from core
  window.addEventListener('message', (ev)=>{
    const d = ev.data || {};
    if(d && d.type === 'export-mcr' && d.base64){
      lastMcrBuffer = base64ToArrayBuffer(d.base64);
      appendLog('Recebido .mcr do emulador via postMessage.');
    }
    if(d && d.type === 'export-state' && d.base64){
      appendLog('Recebido state do emulador via postMessage.');
    }
  });

  appendLog('Interface pronta. Aguarde carregar o core se necessário.');
})();
