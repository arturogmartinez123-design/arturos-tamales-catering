/**
 * Arturo’s Tamales & Catering — business settings
 * Edit this file to change price, flavors, inventory, and contact details.
 * The rest of the site reads from here.
 */
window.ArturoConfig = {
  businessName: "Arturo’s Tamales & Catering",
  tagline: "Authentic tamales and catering in Kansas City",
  city: "Kansas City",
  region: "Missouri",
  area: "Kansas City Northland",
  pricePerDozen: 28,
  currency: "USD",

  /**
   * When true, the order form will not accept more dozens than
   * each flavor’s `dozensAvailable` value.
   */
  inventoryEnabled: true,

  /**
   * Add a flavor object here when you introduce a new filling.
   * Set available: false to hide it from the menu and forms.
   */
  flavors: [
    {
      id: "green-chicken",
      name: "Green Chicken",
      category: "Bright & tangy",
      description:
        "Juicy chicken and salsa verde in soft corn masa. A brighter, tangy dozen.",
      available: true,
      dozensAvailable: 1,
      image: "/images/green-chicken.jpg"
    },
    {
      id: "red-pork",
      name: "Shredded Red Pork",
      category: "The classic",
      description:
        "Tender shredded pork in a deep red chile sauce. The savory dozen most tables start with.",
      available: true,
      dozensAvailable: 3
    }
  ],

  deliveryRadiusMiles: 10,
  pickupNote: "Pickup from the Northland. Exact address is sent after we confirm.",
  allergyNote:
    "Tamales are made with corn masa and gluten-free ingredients. Shared kitchen—tell us about celiac needs or allergies before we confirm.",

  /**
   * Optional. If you add an address, it will show in the footer and SEO markup.
   */
  streetAddress: "",
  phone: "",

  /**
   * Inquiries are prepared as an email draft. Replace with your inbox
   * when you are ready to receive orders (or connect a form service).
   */
  inquiryEmail: "arturogmartinez123@gmail.com",

  paymentsUrl: "https://arturos-tamales-catering.pilgrims297.chatgpt.site/pay",
  ownerInboxUrl: "https://arturos-tamales-catering.pilgrims297.chatgpt.site/inquiries"
};
