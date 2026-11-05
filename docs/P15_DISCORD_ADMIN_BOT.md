# BAS Community — bot administrativo privado

**Estado em 2026-11-05: requisito confirmado; bot interativo não conectado ou validado.**
O despachante antigo de notificações em texto foi desabilitado. Um webhook
que envia texto não substitui o painel administrativo remoto.

## Funções

- O USUÁRIO denuncia uma animação DENTRO DO BAS. Não há instrução
  para enviar denúncias pelo Discord.
- A ADMINISTRADORA recebe no Discord uma mensagem privada para cada
  pedido de publicação, denúncia e outro evento do painel de moderação.
- Pedidos de publicação mostram GIF preview REAL gerado de frames de
  um ZIP validado, título, descrição, autor, tags, licença e informações técnicas.
- Quatro botões: **Aprovar**, **Negar**, **Mais informações** e **Baixar**.
  Negar exige justificativa. Download só para a administradora,
  sem expor o objeto privado do R2 a um endereço público.
- As mesmas transições e auditorias usadas pelo painel web se aplicam
  aos botões do Discord. Clicar duas vezes não pode repetir a decisão.
- Denúncias criadas no site aparecem na caixa privada administrativa
  com motivo e ações cabíveis, sem pedir que usuários entrem no Discord.

## Antes de conectar

- Aplicação Discord com Interactions Endpoint; verificar assinatura
  Ed25519, timestamp e identidade do usuário em toda interação.
- Lista explícita de IDs Discord da administradora e contexto do
  canal privado; validar server-side autor, papel, ação e estado atual.
- Segredos do bot apenas em Cloudflare bindings; não em frontend/Git.
- GIF preview com limites de frames, tamanho, processamento e MIME.
  Não usar GIF fictício nem links permanentes da quarentena R2.
- Autorização expressa para bot e canal de destino, depois testes reais.

O endpoint antigo de despacho de webhook em texto permanece bloqueado.
Não ativar DISCORD_NOTIFICATIONS_APPROVED para tentar reutilizá-lo.

Referência: https://discord.com/developers/docs/interactions/receiving-and-responding
