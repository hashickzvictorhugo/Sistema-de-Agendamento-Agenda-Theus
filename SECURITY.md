# Política de segurança

## Versões suportadas

O branch `main` representa a única versão atualmente suportada.

## Como reportar

Não abra uma issue pública com credenciais, dados pessoais ou instruções de
exploração. Envie um relato privado pelo recurso **Report a vulnerability** da
aba Security do GitHub, incluindo impacto, passos de reprodução e uma sugestão
de correção quando possível.

## Modelo de ameaça resumido

- a identidade primária é fornecida pelo Sign in with ChatGPT;
- toda consulta de produto é filtrada pelo identificador do usuário no servidor;
- o painel administrativo exige proprietário por ID estável e uma senha adicional;
- sessões administrativas são assinadas, curtas, persistidas e revogáveis;
- mutações exigem origem idêntica, conteúdo JSON e validação de tamanho;
- segredos existem somente no ambiente de execução.

Detalhes e limitações estão em [`docs/security.md`](docs/security.md).
