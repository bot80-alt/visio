import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const sampleSpark =
  "create a pin of brad pitt, de caprio, jennifer lawerance as gta 6 posters";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
      <p className="text-sm font-medium tracking-wide text-muted-foreground">
        Cognitive Asset Engine
      </p>
      <h1 className="mt-3 max-w-xl text-4xl font-semibold tracking-tight">
        From a spark to the exact materials.
      </h1>
      <p className="mt-4 max-w-lg text-base leading-7 text-muted-foreground">
        Interpret an abstract idea, then retrieve the cutouts, plates, type,
        and edit strategy to compose it.
      </p>
      <Card className="mt-12">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Mock cognitive endpoint</CardTitle>
            <Badge variant="secondary">Ready</Badge>
          </div>
          <CardDescription>
            POST /api/cognitive-search with a JSON query. The GTA poster spark
            returns the full fixture.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border bg-muted/40 px-4 py-3 text-sm leading-6 text-muted-foreground">
            {sampleSpark}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
