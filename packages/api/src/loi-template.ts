import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const defaultLoiTemplate = await readFile(
  new URL("./templates/loi-default.typ", import.meta.url),
  "utf8",
);

export const defaultLoiVariables = {
  documentTitle: "INTENSJONSERKLÆRING",
  subtitle: "Uforpliktende uttrykk for interesse og videre dialog",
  projectName: "",
  ourSignerRole: "Student ved Entreprenørskolen, NTNU",
  counterpartySignerRole: "",
  signatureNote:
    "Ved signering bekrefter partene at teksten gjengir deres nåværende, uforpliktende intensjon.",
};

export const defaultLoiSections = [
  {
    title: "Felles intensjon",
    body: "Partene ser prosjektets problemområde som relevant og ønsker å holde kontakt mens mulighetene undersøkes videre. Dialogen er enkel og uforpliktende.",
  },
  {
    title: "Formål",
    body: "Erklæringen dokumenterer partenes interesse for prosjektets problemområde og et ønske om videre dialog. Formålet er å få relevante innspill og et bedre grunnlag for å vurdere videre utvikling og mulig utprøving.",
  },
  {
    title: "Tiltenkt samarbeid",
    body: "• Holde kontakt gjennom relevante samtaler og oppdateringer.\n• Dele praktisk erfaring, faglige innspill og tilbakemeldinger så langt tid, kapasitet og interne rammer tillater det.\n• Vurdere et relevant besøk eller senere utprøving dersom dette er praktisk og prosjektet er modent nok.\n• Avklare omfang, ansvar, sikkerhet og praktiske rammer særskilt før et eventuelt besøk, en test eller en pilot.",
  },
  {
    title: "Omtale av dialogen",
    body: "Prosjektet kan opplyse at motparten har uttrykt interesse for problemområdet og er positiv til videre dialog. Omtalen skal være saklig og ikke gi inntrykk av kjøp, investering, eksklusivitet, ferdig løsning eller kommersiell godkjenning. Bruk av logo, sitater eller konkrete resultater krever særskilt skriftlig godkjenning.",
  },
  {
    title: "Økonomi",
    body: "Erklæringen innebærer ingen betaling eller økonomisk forpliktelse for noen av partene. Eventuelle kostnader eller ressursbidrag knyttet til senere besøk, testing eller pilot må avtales skriftlig på forhånd.",
  },
  {
    title: "Fortrolighet og rettigheter",
    body: "Det skal ikke deles personopplysninger, forretningshemmeligheter eller annen fortrolig informasjon uten særskilt avtale. Partene beholder alle rettigheter til egne data, metoder, materiale og immaterielle verdier. Erklæringen overfører ingen slike rettigheter.",
  },
  {
    title: "Oppstart og uforpliktende karakter",
    body: "Den tiltenkte dialogen starter når partene er enige om det og fortsetter så lenge partene ønsker det. Erklæringen er uforpliktende og er ikke en bestilling, investering, eksklusivitetsavtale eller garanti for videre samarbeid eller testing. Ingen av partene er forpliktet til å inngå en senere avtale, kjøpe eller levere en løsning eller stille anlegg, personell eller utstyr til disposisjon. Begge parter kan når som helst avslutte dialogen.",
  },
];

export type LoiTemplateData = {
  team_business_name: string;
  organization_name: string;
  our_signer_name: string;
  counterparty_signer_name: string;
  document_date: string;
  document_title: string;
  subtitle: string;
  project_name: string;
  our_signer_role: string;
  counterparty_signer_role: string;
  signature_note: string;
  sections: { title: string; body: string }[];
  team_logo: string | null;
  counterparty_logo: string | null;
};

export async function compileLoiPdf(
  source: string,
  data: LoiTemplateData,
  images: { team?: Uint8Array; counterparty?: Uint8Array },
) {
  const dir = await mkdtemp(join(tmpdir(), "contac-loi-"));
  try {
    await Promise.all([
      writeFile(join(dir, "main.typ"), source || defaultLoiTemplate),
      writeFile(join(dir, "data.json"), JSON.stringify(data)),
      ...(images.team ? [writeFile(join(dir, "team-logo.png"), images.team)] : []),
      ...(images.counterparty
        ? [writeFile(join(dir, "counterparty-logo.png"), images.counterparty)]
        : []),
    ]);
    const proc = Bun.spawn(["typst", "compile", "--root", dir, "main.typ", "output.pdf"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        TYPST_PACKAGE_PATH: join(dir, "packages"),
        TYPST_PACKAGE_CACHE_PATH: join(dir, "packages"),
      },
    });
    const timer = setTimeout(() => proc.kill(), 20_000);
    try {
      const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
      if (code !== 0)
        throw new Error(`Typst: ${stderr.slice(0, 3000) || "PDF compilation failed"}`);
    } finally {
      clearTimeout(timer);
    }
    const pdf = await readFile(join(dir, "output.pdf"));
    if (pdf.byteLength > 10 * 1024 * 1024) throw new Error("LOI PDF exceeds 10 MiB");
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
