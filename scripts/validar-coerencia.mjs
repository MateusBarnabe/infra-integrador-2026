import { readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import process from "node:process";
import YAML from "yaml";

const root = process.cwd();
const modulosDir = join(root, "modulos");
const permissoesDir = join(root, "permissoes");
const erros = [];

function erro(arquivo, mensagem) {
  erros.push(`${arquivo}: ${mensagem}`);
}

const arquivosModulos = (await readdir(modulosDir))
  .filter((arquivo) => arquivo.endsWith(".json") && arquivo !== "schema.json")
  .sort();
const arquivosPermissoes = (await readdir(permissoesDir))
  .filter((arquivo) => arquivo.endsWith(".yaml") && arquivo !== "schema.yaml")
  .sort();

const registros = [];
const permissoesPorCodigo = new Map();

for (const arquivo of arquivosModulos) {
  const caminho = join(modulosDir, arquivo);
  const registro = JSON.parse(await readFile(caminho, "utf8"));
  const nomeArquivo = `modulos/${arquivo}`;
  const codigoArquivo = basename(arquivo, ".json");

  if (registro.codigo !== codigoArquivo) {
    erro(nomeArquivo, `o campo codigo deve ser "${codigoArquivo}" para bater com o nome do arquivo`);
  }

  if (registro.codigo) {
    const esperados = {
      urlFrontend: `/modulos/${registro.codigo}/`,
      prefixoApi: `/api/${registro.codigo}`,
      healthcheck: `/api/${registro.codigo}/health`,
      permissaoMenu: `${registro.codigo}.acessar`,
    };
    for (const [campo, esperado] of Object.entries(esperados)) {
      if (registro[campo] !== esperado) {
        erro(nomeArquivo, `${campo} deve ser "${esperado}" para o código "${registro.codigo}"`);
      }
    }
  }

  registros.push({ arquivo: nomeArquivo, registro });
}

for (const arquivo of arquivosPermissoes) {
  const caminho = join(permissoesDir, arquivo);
  const lista = YAML.parse(await readFile(caminho, "utf8"));
  const nomeArquivo = `permissoes/${arquivo}`;
  const moduloArquivo = basename(arquivo, ".yaml");

  if (lista.modulo !== moduloArquivo) {
    erro(nomeArquivo, `o campo modulo deve ser "${moduloArquivo}" para bater com o nome do arquivo`);
  }

  const modulo = lista.modulo;
  for (const permissao of lista.permissoes ?? []) {
    const codigo = permissao.codigo;
    if (modulo && codigo && !codigo.startsWith(`${modulo}.`)) {
      erro(nomeArquivo, `a permissão ${codigo} deve começar com ${modulo}.`);
    }
    if (codigo) {
      const anterior = permissoesPorCodigo.get(codigo);
      if (anterior) {
        erro(nomeArquivo, `a permissão ${codigo} está repetida em ${anterior}`);
      } else {
        permissoesPorCodigo.set(codigo, nomeArquivo);
      }
    }
  }
}

for (const { arquivo, registro } of registros) {
  const citadas = [registro.permissaoMenu, ...(registro.itensSubmenu ?? []).map((item) => item.permissao)];
  for (const permissao of citadas) {
    if (permissao && !permissoesPorCodigo.has(permissao)) {
      erro(arquivo, `a permissão ${permissao} não existe em permissoes/`);
    }
  }
}

if (erros.length > 0) {
  console.error(erros.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Coerência validada: ${registros.length} registros e ${permissoesPorCodigo.size} permissões.`);
}