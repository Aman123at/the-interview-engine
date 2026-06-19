import type { LibraryPageModule } from "../../types";
import Preview from "./Preview";
import { sources } from "./sources";

const page: LibraryPageModule = {
  id: "ecommerce-products",
  title: "Products",
  description:
    "Responsive grid of product cards (thumbnail, title, description, price, Add-to-cart). Inline dummy product array, dummy add-to-cart handler.",
  category: "E-commerce",
  Preview,
  react: sources,
};

export default page;
