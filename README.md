# Sistema de Agendamento — Agenda THEUS

O **THEUS** é um organizador pessoal full-stack para centralizar tarefas, notas e compromissos em uma interface escura com identidade visual vermelha.

**Produção:** [theus-organizador.duraesalvesvictorhug.chatgpt.site](https://theus-organizador.duraesalvesvictorhug.chatgpt.site)

## Recursos

- painel diário com foco sugerido e progresso;
- tarefas com prioridade, prazo e status;
- notas fixáveis;
- agenda de compromissos;
- busca global e interface responsiva;
- autenticação com Sign in with ChatGPT;
- dados isolados por conta no Cloudflare D1;
- painel administrativo exclusivo do proprietário;
- sessão administrativa curta, auditoria e bloqueio por tentativas.

## Tecnologias

- React 19 e TypeScript;
- Next App Router sobre Vinext;
- Cloudflare Workers e D1;
- Drizzle ORM e migrations SQLite;
- Sites para build e hospedagem.

## Executando localmente

Requer Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

O projeto abre em `http://localhost:3000`.

As variáveis administrativas estão documentadas em `.env.example`. Valores reais devem permanecer no ambiente do servidor e nunca ser adicionados ao Git:

```dotenv
ADMIN_OWNER_EMAIL=
ADMIN_PASSWORD_HASH=
ADMIN_SESSION_SECRET=
```

## Banco de dados

O schema está em `db/schema.ts` e as migrations versionadas ficam em `drizzle/`.

```bash
npm run db:generate
```

As consultas do organizador derivam o proprietário da identidade autenticada no servidor; o cliente não fornece o `ownerId`.

## Qualidade

```bash
npm run lint
npm run typecheck
npm run build
node --test tests/rendered-html.test.mjs
```

## Segurança administrativa

O botão **Admin** é renderizado apenas para a conta proprietária configurada. O acesso elevado também exige uma segunda senha, validada por PBKDF2 no servidor. A sessão usa cookie assinado `HttpOnly`, `Secure` e `SameSite=Strict`, expira após 15 minutos e possui limitação persistente de tentativas no D1.

Nenhuma senha, hash real ou segredo de sessão é armazenado neste repositório.
