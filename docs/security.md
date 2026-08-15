# Segurança por design

## Autenticação e autorização

O dispatcher da plataforma autentica visitantes e fornece um identificador
estável por Site. O backend usa esse ID para isolamento entre contas e para a
allowlist do proprietário. E-mail e nome são apenas dados de apresentação.

O painel administrativo adiciona uma segunda credencial com PBKDF2-HMAC-SHA256
e custo mínimo de 600 mil iterações. O limitador reserva tentativas no D1 antes
da derivação da senha, impedindo que requisições paralelas ultrapassem o limite.

## Sessão administrativa

- cookie `__Host-`, `HttpOnly`, `Secure` e `SameSite=Strict`;
- assinatura HMAC-SHA256 com segredo mínimo de 32 bytes;
- validade fixa de 15 minutos e vínculo ao usuário autenticado;
- nonce persistido no D1 e verificado em toda requisição;
- revogação no servidor ao bloquear o painel;
- rejeição de cookies duplicados, adulterados, expirados ou de outro usuário.

## Dados

Consultas de tarefas, notas e eventos incluem `owner_id` no servidor. O resumo
administrativo mostra apenas agregados da conta proprietária, sem textos,
e-mails, identificadores ou dados de outros usuários.

## HTTP

Mutações falham quando `Origin` está ausente ou é diferente da origem da
aplicação. Corpos JSON têm limite de tamanho e campos aceitos explicitamente.
Respostas privadas usam `no-store`; o Worker adiciona CSP, HSTS, proteção contra
frames, `nosniff`, política de referência e bloqueio de permissões sensíveis.

## Validação automatizada

Os testes cobrem senha, configuração incompleta, vínculo por ID, adulteração e
revogação de sessão, concorrência do limitador, isolamento dos agregados e
origem de mutações. CI também executa lint, TypeScript, build e CodeQL.

## Limitações conhecidas

- o site público aceita qualquer usuário que conclua o login da plataforma;
- quotas por conta ainda são um item de roadmap;
- a CSP mantém scripts e estilos inline para compatibilidade com o runtime beta;
- ações administrativas destrutivas não fazem parte desta versão.
