# ADR 0001 — Vinext sobre Cloudflare Workers

**Status:** aceito

## Contexto

O produto precisa de renderização React, rotas de API, autenticação gerenciada e
acesso de baixa latência ao D1 em um único artefato implantável.

## Decisão

Usar React 19 e convenções do Next App Router por meio do Vinext, gerando um
Worker ESM. As versões ficam fixadas e cada mudança passa por typecheck, build e
smoke test do artefato.

## Consequências

O deploy fica simples e próximo ao banco, mas um runtime beta aumenta risco de
compatibilidade. Evitamos APIs exclusivas do Node, mantemos a entrada do Worker
explícita e tratamos upgrades de Vinext como mudanças revisadas, não automáticas.
