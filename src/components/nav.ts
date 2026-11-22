/** Plan du site : 4 groupes orientés vers ce que l'on veut faire (une seule source pour le menu et l'accueil). */
export interface NavItem { href: string; label: string; desc: string }
export interface NavGroup { id: string; label: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    id: "jouer", label: "Jouer",
    items: [
      { href: "/plateau", label: "Plateau", desc: "Jouer ou regarder un match" },
      { href: "/analyse", label: "Analyse de partie", desc: "Chaque coup évalué par l'IA experte" },
    ],
  },
  {
    id: "optimiser", label: "Optimiser",
    items: [
      { href: "/conseiller", label: "Conseiller de deck", desc: "Les meilleurs changements pour votre deck" },
      { href: "/simulateur", label: "Simulateur de decks", desc: "Comparer des decks sur des milliers de duels" },
      { href: "/collection", label: "Ma collection", desc: "Vos cartes et talents débloqués" },
    ],
  },
  {
    id: "comprendre", label: "Comprendre",
    items: [
      { href: "/meta", label: "Méta & tier list", desc: "Le classement des meilleurs decks" },
      { href: "/impact", label: "Impact sur la victoire", desc: "Ce que rapporte chaque Tox, carte ou talent" },
      { href: "/tox", label: "Tox & talents", desc: "Passifs, prix et probabilités de la boutique" },
    ],
  },
  {
    id: "references", label: "Références",
    items: [
      { href: "/cartes", label: "Toutes les cartes", desc: "Base de données officielle" },
      { href: "/patchs", label: "Patchs", desc: "Ce qui change entre les versions" },
    ],
  },
];

export const groupOf = (path: string): NavGroup | undefined => NAV.find((g) => g.items.some((i) => path === i.href || path.startsWith(i.href + "/")));
export const itemOf = (path: string): NavItem | undefined => NAV.flatMap((g) => g.items).find((i) => path === i.href || path.startsWith(i.href + "/"));
