import { Streamdown } from "streamdown";

/**
 * Rendu markdown du texte assistant (gras, listes, tableaux GFM, code, liens).
 *
 * Streamdown gère proprement le markdown INCOMPLET pendant le streaming
 * (`parseIncompleteMarkdown`) et durcit la sortie (rehype-sanitize/harden).
 *
 * Notes d'intégration (widget embarquable, shadow DOM) :
 *  - `controls={false}` : pas de boutons copy/download (inutiles ici, et leurs
 *    icônes/styles supposent Tailwind absent du shadow root).
 *  - on n'active AUCUN plugin mermaid/math/shiki : le cœur de streamdown reste
 *    léger et le bundle IIFE ne tire pas ces dépendances lourdes.
 *  - le style vient de notre CSS (`.cme-md` dans styles.ts), pas de Tailwind :
 *    les classes utilitaires de streamdown sont des no-op ici, on stylise les
 *    éléments HTML sémantiques rendus.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="cme-md">
      <Streamdown controls={false} parseIncompleteMarkdown>
        {children}
      </Streamdown>
    </div>
  );
}
