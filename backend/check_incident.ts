import { prisma } from "./src/db/client.ts";

const incident = await prisma.incident.findFirst({
  where: { id: "cmt72ct670001wxesfg03f6aj" },
  include: { actions: true }
});

console.log("Incident found:", JSON.stringify(incident, null, 2));
process.exit(0);
