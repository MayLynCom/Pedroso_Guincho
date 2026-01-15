const cepForm = document.getElementById("cep-form");
const resultBox = document.getElementById("cep-resultado");
const errorBox = document.getElementById("cep-erro");
const distanceSpan = document.getElementById("resultado-km");
const priceSpan = document.getElementById("resultado-preco");
const callButton = document.getElementById("btn-chamado");
const normalizeAddress = (value = "") => value.replace(/\s+/g, " ").trim();
let lastResultData = null;
updateCallButtonState();

if (cepForm) {
  cepForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const addressVeiculo = normalizeAddress(document.getElementById("endereco-veiculo")?.value || "");
    const addressDestino = normalizeAddress(document.getElementById("endereco-destino")?.value || "");
    const tipoVeiculo = document.querySelector('input[name="tipoVeiculo"]:checked')?.value;

    if (addressVeiculo.length < 5 || addressDestino.length < 5 || !tipoVeiculo) {
      showError("Informe os enderecos completos e escolha o tipo de veiculo.");
      return;
    }

    toggleLoading(true);

    try {
      const response = await fetch("/.netlify/functions/distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleAddress: addressVeiculo,
          destinationAddress: addressDestino,
          vehicleType: tipoVeiculo,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Nao foi possivel calcular a distancia.");
      }

      const { distanceKm, price } = payload;
      if (typeof distanceKm !== "number" || typeof price !== "number") {
        throw new Error("Resposta invalida do servidor.");
      }

      lastResultData = {
        vehicleAddress: addressVeiculo,
        destinationAddress: addressDestino,
        vehicleType: tipoVeiculo,
        distanceKm,
        price,
      };

      distanceSpan.textContent = `${distanceKm.toFixed(2)} km`;
      priceSpan.textContent = price.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
      });
      showResult();
      updateCallButtonState();
    } catch (error) {
      lastResultData = null;
      showError(error.message || "Falha ao processar o calculo.");
      updateCallButtonState();
    } finally {
      toggleLoading(false);
    }
  });
}

function showResult() {
  if (resultBox) resultBox.classList.remove("hidden");
  if (errorBox) errorBox.classList.add("hidden");
}

function showError(message) {
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
  }
  if (resultBox) {
    resultBox.classList.add("hidden");
  }
}

function toggleLoading(isLoading) {
  const button = cepForm?.querySelector("button");
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = isLoading ? "Calculando..." : "Calcular percurso";
}

function updateCallButtonState() {
  if (!callButton) return;
  callButton.disabled = !lastResultData;
}

if (callButton) {
  callButton.addEventListener("click", () => {
    if (!lastResultData) return;
    pushConversionData(lastResultData);
    const message = buildWhatsappMessage(lastResultData);
    const url = `https://wa.me/554198222624?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  });
}

function pushConversionData(data) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: "whatsapp_lead",
    value: Number(data.price.toFixed(2)),
    currency: "BRL",
  });
}

function buildWhatsappMessage(data) {
  const vehicleNames = {
    carro_moto: "Carro ou moto",
    moto: "Moto",
    carro: "Carro de passeio",
    utilitario: "Pick-up leve / furgao",
    pesado: "Veiculo grande / comercial",
    extrap: "Semi pesado (carretas e maquinario)",
  };

  const priceFormatted = data.price.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });

  return (
    "*Chamado de Guincho*\n" +
    `Endereco do veiculo: ${data.vehicleAddress}\n` +
    `Endereco do destino: ${data.destinationAddress}\n` +
    `Tipo do veiculo: ${vehicleNames[data.vehicleType] || data.vehicleType}\n` +
    `Distancia total: ${data.distanceKm.toFixed(2)} km\n` +
    `Preco estimado: ${priceFormatted}`
  );
}
