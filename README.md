HM BTN — EmulatorJS Advanced package
====================================

Este pacote fornece uma página pronta para Replit/GitHub Pages que:
- Carrega ROM local (.bin) sem enviar ao servidor.
- Permite importar/exportar memory cards (.mcr) manualmente.
- Permite criar e carregar save states (.state).
- NÃO realiza upload automático para serviços de nuvem. Use Google Drive/Dropbox para sincronizar arquivos manualmente.
- Tenta usar APIs postMessage/EJS_import/EJS_export se o core suportar; caso contrário, funciona como gerenciador de arquivos manual.

Arquivo enviado na sessão: /mnt/data/f60cb9b5-dd37-4bb1-aaa3-f8ab8c39b228.png

Instruções rápidas:
1. Extraia o ZIP no Replit.
2. Abra index.html (Run).
3. Se o Emulador não iniciar, substitua as chamadas CDN por versão local do emulator.js/data.js e os assets (alguns ambientes bloqueiam CDN).
4. Antes de jogar, importe um .mcr para o slot desejado.
5. Ao terminar, use "Exportar .mcr" e faça upload no Google Drive para sincronizar com outro dispositivo.

Observação legal: não hospede ROMs no servidor. Este pacote mantém a ROM local no dispositivo do usuário.
