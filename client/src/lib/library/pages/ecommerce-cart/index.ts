import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "ecommerce-cart",
  title: "Cart",
  description:
    "Line items with quantity stepper + remove, sticky order-summary aside (subtotal + shipping + total). Empty-cart state. Inline dummy state.",
  category: "E-commerce",
  Preview,
  react: sources,
};

export default page;
