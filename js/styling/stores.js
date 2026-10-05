// Brand stores the scout can search (all Shopify storefronts with public product search, checked Oct 2026).
// gender: who the store mostly sells to. styles: used to pick stores that fit your style profile.
export const STORES = [
  { domain: 'colorfulstandard.com', brand: 'Colorful Standard', gender: 'unisex', styles: ['minimal', 'scandi'] },
  { domain: 'www.norseprojects.com', brand: 'Norse Projects', gender: 'unisex', styles: ['scandi', 'minimal', 'workwear'] },
  { domain: 'www.universalworks.co.uk', brand: 'Universal Works', gender: 'men', styles: ['workwear', 'classic'] },
  { domain: 'www.oliverspencer.co.uk', brand: 'Oliver Spencer', gender: 'men', styles: ['classic', 'smart casual'] },
  { domain: 'www.folkclothing.com', brand: 'Folk', gender: 'unisex', styles: ['minimal', 'workwear'] },
  { domain: 'www.drakes.com', brand: "Drake's", gender: 'men', styles: ['classic', 'preppy', 'old money', 'business'] },
  { domain: 'www.aimeleondore.com', brand: 'Aimé Leon Dore', gender: 'men', styles: ['preppy', 'streetwear', 'old money'] },
  { domain: 'kith.com', brand: 'Kith', gender: 'unisex', styles: ['streetwear', 'athleisure'] },
  { domain: 'www.everlane.com', brand: 'Everlane', gender: 'unisex', styles: ['minimal', 'classic'] },
  { domain: 'www.outerknown.com', brand: 'Outerknown', gender: 'unisex', styles: ['workwear', 'outdoor'] },
  { domain: 'fahertybrand.com', brand: 'Faherty', gender: 'unisex', styles: ['classic', 'bohemian'] },
  { domain: 'knowledgecottonapparel.com', brand: 'KnowledgeCotton Apparel', gender: 'unisex', styles: ['scandi', 'minimal'] },
  { domain: 'www.taylorstitch.com', brand: 'Taylor Stitch', gender: 'men', styles: ['workwear', 'classic'] },
  { domain: 'www.percivalclo.com', brand: 'Percival', gender: 'men', styles: ['classic', 'smart casual'] },
  { domain: 'www.reigningchamp.com', brand: 'Reigning Champ', gender: 'unisex', styles: ['athleisure', 'minimal'] },
  { domain: 'www.sunspel.com', brand: 'Sunspel', gender: 'unisex', styles: ['minimal', 'classic'] },
  { domain: 'www.stussy.com', brand: 'Stüssy', gender: 'unisex', styles: ['streetwear'] },
  { domain: 'pangaia.com', brand: 'PANGAIA', gender: 'unisex', styles: ['athleisure', 'minimal'] },
  { domain: 'www.allbirds.com', brand: 'Allbirds', gender: 'unisex', styles: ['minimal', 'sporty'] },
  { domain: 'www.velasca.com', brand: 'Velasca', gender: 'men', styles: ['classic', 'smart casual'] },
  { domain: 'www.koio.co', brand: 'Koio', gender: 'unisex', styles: ['minimal'] },
  { domain: 'olivercabell.com', brand: 'Oliver Cabell', gender: 'unisex', styles: ['minimal'] },
  { domain: 'thursdayboots.com', brand: 'Thursday', gender: 'unisex', styles: ['classic', 'workwear'] },
  { domain: 'outdoorvoices.com', brand: 'Outdoor Voices', gender: 'unisex', styles: ['athleisure', 'sporty'] },
  { domain: 'staud.clothing', brand: 'STAUD', gender: 'women', styles: ['romantic', 'minimal'] },
  { domain: 'www.livincool.com', brand: 'LIVINCOOL', gender: 'unisex', styles: ['streetwear'] },
  { domain: 'www.saturdaysnyc.com', brand: 'Saturdays NYC', gender: 'men', styles: ['minimal', 'streetwear'] },
  { domain: 'www.rowingblazers.com', brand: 'Rowing Blazers', gender: 'unisex', styles: ['preppy', 'vintage'] },
];

export const storeFor = (domainOrBrand) => STORES.find((s) => s.domain === domainOrBrand || s.brand.toLowerCase() === String(domainOrBrand).toLowerCase());
