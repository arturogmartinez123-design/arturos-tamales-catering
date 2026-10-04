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
  siteUrl: "https://arturos-tamales-catering.onrender.com",
  pricePerDozen: 28,
  currency: "USD",

  /**
   * Soonest date the forms will accept, counted from today.
   * 0 allows today. 1 means tomorrow or later.
   */
  minimumLeadDays: 1,

  /**
   * STOCK — edit inventory here and nowhere else.
   * dozensAvailable is how many dozen of that flavor are left in this batch.
   * Set it to 0 to show the flavor as sold out. Set available to false to hide it.
   * Set inventoryEnabled to false to stop enforcing these numbers.
   */
  inventoryEnabled: true,

  flavors: [
    {
      id: "green-chicken",
      name: "Green Chicken",
      category: "Bright & tangy",
      description:
        "Juicy chicken and salsa verde in soft corn masa. A brighter, tangy dozen.",
      available: true,
      dozensAvailable: 3,
      image: "assets/green-chicken.webp",
      imageAlt: "Green chicken tamale in a corn husk on a dark plate, with salsa verde on the side",
      imageWidth: 960,
      imageHeight: 540
    },
    {
      id: "red-pork",
      name: "Shredded Red Pork",
      category: "The classic",
      description:
        "Tender shredded pork in a deep red chile sauce. The savory dozen most tables start with.",
      available: true,
      dozensAvailable: 3,
      image: "assets/red-pork.webp",
      imageAlt: "Shredded red pork tamale on a dark slate plate, with salsa beside it",
      imageWidth: 960,
      imageHeight: 540
    }
  ],

  deliveryRadiusMiles: 10,

  /**
   * Contact. phone and streetAddress render only when they are non-empty.
   * Leave streetAddress blank — do not invent one.
   * A 10-digit US phone is shown as (816) 203-7610 and linked as tel:+1...
   */
  phone: "816-203-7610",
  streetAddress: "",

  /** Inbox for orders, catering requests, and update requests. */
  inquiryEmail: "arturogmartinez123@gmail.com",

  /**
   * Form backend. Order, catering, and update forms POST JSON here.
   * This is FormSubmit’s AJAX endpoint (no account). The first submission
   * emails a one-time activation link to inquiryEmail — open it and click
   * Activate Form once. Until that click, the site keeps the visitor’s
   * answers and shows an error instead of a success message.
   * Replace the URL if you switch providers.
   */
  formEndpoint: "https://formsubmit.co/ajax/arturogmartinez123@gmail.com",

  /** Pay only after an order is confirmed. Handle from the existing Venmo link. */
  venmoHandle: "@Arturo-Gomez-70",
  venmoUrl: "https://venmo.com/Arturo-Gomez-70",

  /**
   * Optional round photo beside the Venmo button. Leave blank until a photo is provided.
   * venmoAvatar is a path such as "assets/venmo-avatar.jpg".
   */
  venmoAvatar: "",
  venmoAvatarAlt: "",

  /**
   * Header, footer, and 404 mark. To swap the logo, change logoMark and set the
   * same path on each img[data-logo] so the mark still shows if JavaScript is off.
   */
  logoMark: "assets/logo-icon.svg"
};
