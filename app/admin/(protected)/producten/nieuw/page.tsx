import { createProduct } from "../actions";
import { ProductForm } from "../product-form";
import { Card } from "@/components/ui/card";

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">Nieuw product</h1>
      <p className="max-w-xl text-sm text-slate-600">
        Na het aanmaken kom je op de bewerkpagina en kun je foto&apos;s
        uploaden.
      </p>
      <Card className="max-w-xl">
        <ProductForm
          action={createProduct}
          initial={{ name: "", description: "", indicativePrice: "", active: true }}
          submitLabel="Product aanmaken"
        />
      </Card>
    </div>
  );
}
