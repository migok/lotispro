/**
 * Chargement à la demande du champ téléphone international : les drapeaux SVG
 * et le sélecteur de pays vivent dans un chunk séparé du bundle principal.
 */
let loaded = null;
let pending = null;

export function loadInternationalPhoneInput() {
  pending ??= import('./InternationalPhoneInput').then(
    (module) => {
      loaded = module.default;
      return loaded;
    },
    (error) => {
      pending = null; // nouvel essai au prochain affichage du formulaire
      throw error;
    }
  );
  return pending;
}

/** Le composant s'il est déjà chargé (rendu synchrone, sans repli), sinon null. */
export const loadedInternationalPhoneInput = () => loaded;
