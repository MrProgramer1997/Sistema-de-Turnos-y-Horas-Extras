const { spawn } = require("child_process");
const path = require("path");

const basePath = __dirname;

const scripts = [
  {
    name: "Terminales",
    file: path.join(basePath, "src", "sync-terminals.js"),
  },
  {
    name: "Empleados",
    file: path.join(basePath, "src", "sync-employees.js"),
  },
  {
    name: "Marcaciones",
    file: path.join(basePath, "src", "sync-transactions.js"),
  },
  {
    name: "Personas pendientes hacia BioTime",
    file: path.join(basePath, "src", "sync-people-queue.js"),
  },
];

function runScript(script) {
  return new Promise((resolve, reject) => {
    console.log("");
    console.log("========================================");
    console.log(`INICIANDO: ${script.name}`);
    console.log("========================================");

    const child = spawn(
      process.execPath,
      [script.file],
      {
        cwd: basePath,
        stdio: "inherit",
        env: process.env,
      }
    );

    child.on("error", (error) => {
      reject(
        new Error(
          `${script.name}: ${error.message}`
        )
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log("");
        console.log(
          `${script.name}: finalizado correctamente`
        );

        resolve();
      } else {
        reject(
          new Error(
            `${script.name}: terminó con código ${code}`
          )
        );
      }
    });
  });
}

async function main() {
  const inicio = new Date();

  console.log("");
  console.log("========================================");
  console.log("BIOTIME CONNECTOR");
  console.log("========================================");
  console.log(
    `Inicio: ${inicio.toLocaleString()}`
  );

  try {
    for (const script of scripts) {
      await runScript(script);
    }

    const fin = new Date();

    console.log("");
    console.log("========================================");
    console.log("SINCRONIZACION COMPLETA");
    console.log("========================================");

    console.log(
      `Fin: ${fin.toLocaleString()}`
    );

    console.log(
      `Duracion: ${
        Math.round(
          (fin - inicio) / 1000
        )
      } segundos`
    );
  } catch (error) {
    console.error("");
    console.error("========================================");
    console.error("ERROR EN BIOTIME CONNECTOR");
    console.error("========================================");
    console.error(error.message);

    process.exitCode = 1;
  }
}

main();