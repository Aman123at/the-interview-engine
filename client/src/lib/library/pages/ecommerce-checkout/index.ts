import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "ecommerce-checkout",
  title: "Checkout",
  description:
    "Address form (name, address lines, city, state/zip, country) with light client-side validation and an order-summary aside. Dummy submit handler.",
  category: "E-commerce",
  Preview,
  react: sources,
};

export default page;
