import Link from "next/link";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

const previewTasks = [
  { title: "Fechar roteiro da apresentação", meta: "Hoje · Alta", done: false },
  { title: "Enviar orçamento para a gráfica", meta: "14:30 · Trabalho", done: false },
  { title: "Comprar filtro de café", meta: "Casa", done: true },
];

export default async function Home() {
  const user = await getChatGPTUser();
  const entryHref = user ? "/app" : chatGPTSignInPath("/app");
  const entryLabel = user ? "Abrir meu espaço" : "Entrar no THEUS";

  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="Navegação principal">
        <Link className="brand-lockup" href="/" aria-label="THEUS, início">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>
            <strong>THEUS</strong>
            <small>Seu mundo, no lugar.</small>
          </span>
        </Link>
        <div className="landing-nav-actions">
          <a href="#sistema">Conheça o sistema</a>
          <a className="button button-light button-compact" href={entryHref}>
            {entryLabel}
          </a>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span /> Feito para o ritmo do Matheus</p>
          <h1>
            Menos coisa<br />
            <em>na cabeça.</em>
          </h1>
          <p className="hero-lead">
            Tarefas, ideias e compromissos finalmente conversando no mesmo lugar.
            Um espaço pessoal para cuidar do hoje sem perder de vista o que vem depois.
          </p>
          <div className="hero-actions">
            <a className="button button-light" href={entryHref}>
              {entryLabel} <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#sistema">
              Ver como funciona <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="trust-line" aria-label="Recursos de segurança">
            <span>● Login protegido</span>
            <span>● Dados separados por conta</span>
            <span>● Salvamento automático</span>
          </div>
        </div>

        <div className="hero-product" aria-label="Prévia do painel THEUS">
          <div className="preview-window">
            <div className="preview-rail">
              <div className="preview-mini-brand">T</div>
              <span className="active">⌂</span>
              <span>✓</span>
              <span>□</span>
              <span>◷</span>
              <span className="preview-avatar">M</span>
            </div>
            <div className="preview-main">
              <div className="preview-top">
                <div>
                  <small>SÁBADO, 8 DE AGOSTO</small>
                  <h2>Boa tarde, Matheus.</h2>
                </div>
                <button type="button" tabIndex={-1}>+ Guardar algo</button>
              </div>
              <div className="preview-grid">
                <article className="preview-focus">
                  <small>AGORA</small>
                  <h3>Preparar apresentação do projeto Aurora</h3>
                  <p>2 de 3 etapas prontas</p>
                  <div className="preview-progress"><i /></div>
                  <b>Abrir foco →</b>
                </article>
                <article className="preview-stat">
                  <span>04</span>
                  <p>coisas pedem<br />atenção hoje</p>
                </article>
              </div>
              <div className="preview-list">
                <div className="preview-list-head">
                  <strong>Próximos passos</strong>
                  <small>VER TODAS</small>
                </div>
                {previewTasks.map((task) => (
                  <div className={task.done ? "preview-task done" : "preview-task"} key={task.title}>
                    <i>{task.done ? "✓" : ""}</i>
                    <span><b>{task.title}</b><small>{task.meta}</small></span>
                    <em>•••</em>
                  </div>
                ))}
              </div>
            </div>
            <aside className="preview-side">
              <small>MAPA DO DIA</small>
              <div className="mini-timeline">
                <div><time>10:00</time><span><b>Projeto Aurora</b><small>Reunião de alinhamento</small></span></div>
                <div className="now"><time>13:00</time><span><b>Almoço com a mãe</b><small>Centro</small></span></div>
                <div><time>19:30</time><span><b>Treino</b><small>Costas + bíceps</small></span></div>
              </div>
              <div className="preview-note">
                <small>NOTA FIXADA</small>
                <p>Três ideias para deixar o apê com mais cara de casa.</p>
              </div>
            </aside>
          </div>
          <div className="orbit-label orbit-one">HOJE <b>4</b></div>
          <div className="orbit-label orbit-two">TUDO SINCRONIZADO <b>✓</b></div>
        </div>
      </section>

      <section className="system-section" id="sistema">
        <div className="section-heading">
          <p className="eyebrow dark"><span /> Um sistema, três movimentos</p>
          <h2>Capture. Organize.<br />Siga em frente.</h2>
          <p>O THEUS foi desenhado para tirar o peso de lembrar de tudo e devolver clareza para agir.</p>
        </div>
        <div className="feature-grid">
          <article>
            <span className="feature-number">01</span>
            <div className="feature-symbol">+</div>
            <h3>Guarde antes de esquecer</h3>
            <p>Uma tarefa, uma ideia ou um compromisso entram em poucos segundos.</p>
          </article>
          <article>
            <span className="feature-number">02</span>
            <div className="feature-symbol">≡</div>
            <h3>Veja só o que importa</h3>
            <p>O painel aproxima prazos, prioridades e agenda sem virar bagunça visual.</p>
          </article>
          <article className="feature-accent">
            <span className="feature-number">03</span>
            <div className="feature-symbol">✓</div>
            <h3>Termine com leveza</h3>
            <p>Marque, ajuste e acompanhe seu ritmo. O sistema cuida do resto.</p>
          </article>
        </div>
      </section>

      <section className="closing-cta">
        <div>
          <p className="eyebrow"><span /> Seu espaço começa aqui</p>
          <h2>Tem muita coisa acontecendo.<br /><em>Agora tem onde colocar.</em></h2>
        </div>
        <a className="button button-light" href={entryHref}>{entryLabel} <span>↗</span></a>
      </section>

      <footer className="landing-footer">
        <Link className="brand-lockup" href="/">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span><strong>THEUS</strong><small>Seu mundo, no lugar.</small></span>
        </Link>
        <p>Organização pessoal com privacidade de verdade.</p>
        <span>© 2026 THEUS</span>
      </footer>
    </main>
  );
}
