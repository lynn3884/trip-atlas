(function () {
  const DATA_URL = "./data/attractions.json";
  const STORAGE_KEYS = {
    favorites: "trip-atlas:favorites",
    collector: "trip-atlas:collector"
  };

  const IMAGE_FALLBACKS = {
    generic: "./assets/images/country-generic.svg",
    countries: {
      taiwan: "./assets/images/country-taiwan.svg",
      japan: "./assets/images/country-japan.svg",
      korea: "./assets/images/country-korea.svg",
      "hong-kong": "./assets/images/country-hong-kong.svg",
      macau: "./assets/images/country-macau.svg",
      thailand: "./assets/images/country-thailand.svg",
      europe: "./assets/images/country-europe.svg"
    }
  };

  const state = {
    dataset: null,
    favorites: new Set(readStorage(STORAGE_KEYS.favorites, [])),
    collector: readStorage(STORAGE_KEYS.collector, []),
    selectedPlaceId: null
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindCommonInteractions();
    bindImageFallbacks();
    bindStorageSync();
    ensurePlaceModal();

    try {
      state.dataset = await loadDataset();
      renderCurrentPage();
    } catch (error) {
      console.error(error);
      showToast("資料讀取失敗，請重新整理");
    } finally {
      hideLoading();
    }
  }

  async function loadDataset() {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load dataset: ${response.status}`);
    }

    const data = await response.json();
    const countriesById = Object.fromEntries(data.countries.map((item) => [item.id, item]));
    const citiesById = Object.fromEntries(data.cities.map((item) => [item.id, item]));
    const categoriesById = Object.fromEntries(data.categories.map((item) => [item.id, item]));

    const attractions = data.attractions.map((item) => ({
      ...item,
      country: countriesById[item.countryId],
      city: citiesById[item.cityId],
      category: categoriesById[item.categoryId]
    }));

    return {
      ...data,
      countriesById,
      citiesById,
      categoriesById,
      attractions
    };
  }

  function bindCommonInteractions() {
    const searchForm = document.getElementById("heroSearchForm");
    const searchInput = document.getElementById("heroSearchInput");

    if (searchForm && searchInput) {
      searchForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const query = searchInput.value.trim();
        const target = query ? `./explore.html?q=${encodeURIComponent(query)}` : "./explore.html";
        window.location.href = target;
      });
    }

    const brand = document.getElementById("brandButton");
    if (brand) {
      let clickCount = 0;
      const handleBrandClick = () => {
        clickCount += 1;
        if (clickCount >= 5) {
          clickCount = 0;
          showToast("喵～你找到旅行貓了！");
        }
      };

      brand.addEventListener("click", handleBrandClick);
      brand.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleBrandClick();
        }
      });
    }
  }

  function bindImageFallbacks() {
    if (document.body.dataset.imageFallbackBound === "true") {
      return;
    }

    document.body.dataset.imageFallbackBound = "true";
    document.addEventListener("error", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) {
        return;
      }

      const fallbackSrc = target.dataset.fallbackSrc;
      if (!fallbackSrc || target.dataset.fallbackApplied === "true") {
        return;
      }

      target.dataset.fallbackApplied = "true";
      target.src = fallbackSrc;
    }, true);
  }

  function bindStorageSync() {
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEYS.favorites) {
        state.favorites = new Set(readStorage(STORAGE_KEYS.favorites, []));
        refreshFavoritesUI({ keepModal: Boolean(state.selectedPlaceId) });
      }

      if (event.key === STORAGE_KEYS.collector) {
        state.collector = readStorage(STORAGE_KEYS.collector, []);
        renderCollectorList();
        renderCollectorPreview();
        renderLocalSummary();
      }
    });
  }

  function ensurePlaceModal() {
    if (document.getElementById("placeModal")) {
      return;
    }

    const modal = document.createElement("div");
    modal.id = "placeModal";
    modal.className = "place-modal";
    modal.innerHTML = `
      <div class="place-modal__backdrop" data-modal-close="true"></div>
      <div class="place-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="placeModalTitle">
        <button class="place-modal__close" type="button" data-modal-close="true" aria-label="關閉">×</button>
        <div class="place-modal__content" id="placeModalContent"></div>
      </div>
    `;

    modal.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.dataset.modalClose === "true") {
        closePlaceModal();
        return;
      }

      const relatedButton = target.closest("[data-related-place-id]");
      if (relatedButton instanceof HTMLElement && relatedButton.dataset.relatedPlaceId) {
        openPlaceModal(relatedButton.dataset.relatedPlaceId);
        return;
      }

      const favoriteButton = target.closest("[data-modal-favorite]");
      if (favoriteButton instanceof HTMLElement && favoriteButton.dataset.modalFavorite) {
        toggleFavorite(favoriteButton.dataset.modalFavorite);
        return;
      }

      const browseButton = target.closest("[data-browse-mode]");
      if (browseButton instanceof HTMLElement && state.selectedPlaceId) {
        applyBrowseMode(state.selectedPlaceId, browseButton.dataset.browseMode);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closePlaceModal();
      }
    });

    document.body.appendChild(modal);
  }

  function renderCurrentPage() {
    const page = document.body.dataset.page;

    if (page === "home") {
      renderHomePage();
      return;
    }

    if (page === "explore") {
      renderExplorePage();
      return;
    }

    if (page === "favorites") {
      renderFavoritesPage();
      return;
    }

    if (page === "map") {
      renderMapPage();
      return;
    }

    if (page === "planner") {
      renderPlannerPage();
      return;
    }

    if (page === "settings") {
      renderSettingsPage();
    }
  }

  function renderHomePage() {
    if (!state.dataset) {
      return;
    }

    renderDestinationGrid();
    renderFeaturedPlaces(document.getElementById("featuredPlaces"), getHomeFeaturedPlaces());
    renderFavoritesPanel();
    renderTravelMap();
    renderStats();
    renderCollectorPreview();
  }

  function renderExplorePage() {
    const searchInput = document.getElementById("exploreSearchInput");
    const params = new URLSearchParams(window.location.search);
    const initialQuery = params.get("q") || "";

    if (searchInput) {
      searchInput.value = initialQuery;
      searchInput.addEventListener("input", renderExploreResults);
    }

    populateExploreFilters();
    bindExploreFilters();
    bindExploreQuickFilters();
    bindExploreResultEvents();
    bindExploreActions();
    renderExploreResults();
  }

  function renderFavoritesPage() {
    if (!state.dataset) {
      return;
    }

    renderFavoritesPanel();
    renderFavoritesShelf();
    renderFavoritesGroups();
  }

  function renderMapPage() {
    if (!state.dataset) {
      return;
    }

    renderTravelMap();
    renderMapFootprints();
  }

  function renderPlannerPage() {
    bindCollectorForm();
    renderCollectorList();
  }

  function renderSettingsPage() {
    if (!state.dataset) {
      return;
    }

    renderLocalSummary();

    const clearFavorites = document.getElementById("clearFavorites");
    if (clearFavorites) {
      clearFavorites.addEventListener("click", () => {
        state.favorites = new Set();
        saveStorage(STORAGE_KEYS.favorites, []);
        renderHomePage();
        renderExploreResults();
        renderLocalSummary();
        if (state.selectedPlaceId) {
          openPlaceModal(state.selectedPlaceId);
        }
        showToast("已清空收藏");
      });
    }

    const clearCollector = document.getElementById("clearCollector");
    if (clearCollector) {
      clearCollector.addEventListener("click", () => {
        state.collector = [];
        saveStorage(STORAGE_KEYS.collector, []);
        renderCollectorList();
        renderCollectorPreview();
        renderLocalSummary();
        showToast("已清空待整理資料");
      });
    }
  }

  function renderDestinationGrid() {
    const container = document.getElementById("destinationGrid");
    if (!container || !state.dataset) {
      return;
    }

    container.innerHTML = state.dataset.countries.map((country) => {
      const cityCount = state.dataset.cities.filter((item) => item.countryId === country.id).length;
      const attractionCount = state.dataset.attractions.filter((item) => item.countryId === country.id).length;

      return `
        <article class="destination-card">
          ${renderManagedImage({
            className: "destination-card__image",
            src: country.image,
            fallbackSrc: getCountryFallbackImage(country.id),
            alt: country.name
          })}
          <div class="destination-card__body">
            <h3>${escapeHtml(country.name)}</h3>
            <p>${escapeHtml(country.summary)}</p>
            <div class="destination-meta">
              <span class="meta-pill">${cityCount} 個城市</span>
              <span class="meta-pill">${attractionCount} 個景點</span>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderFeaturedPlaces(container, places) {
    if (!container) {
      return;
    }

    container.innerHTML = places.map((place) => renderHomeSpotCard(place)).join("");
    bindFavoriteButtons(container);
  }

  function getHomeFeaturedPlaces() {
    if (!state.dataset) {
      return [];
    }

    const featuredPlaces = state.dataset.attractions.filter((place) => place.featured === true);
    const remainingPlaces = state.dataset.attractions.filter((place) => place.featured !== true);
    return [...featuredPlaces, ...remainingPlaces].slice(0, 6);
  }

  function renderFavoritesPanel() {
    const countElement = document.getElementById("favoriteCount");
    const recentElement = document.getElementById("favoriteRecent");

    if (!countElement || !recentElement || !state.dataset) {
      return;
    }

    const favoritePlaces = getFavoritePlaces();
    countElement.textContent = String(favoritePlaces.length);

    if (!favoritePlaces.length) {
      recentElement.innerHTML = `
        <div class="list-empty">
          <img src="./assets/images/white-socks-cat.svg" alt="白襪貓">
          <p>還沒有收藏任何景點，去探索世界吧。</p>
        </div>
      `;
      return;
    }

    recentElement.innerHTML = favoritePlaces.slice(0, 4).map((place) => `
      <article class="favorite-list-item">
        ${renderManagedImage({
          src: place.image,
          fallbackSrc: getPlaceFallbackImage(place),
          alt: place.name
        })}
        <div>
          <strong>${escapeHtml(place.name)}</strong>
          <span>${escapeHtml(place.country.name)} ・ ${escapeHtml(place.city.name)}</span>
        </div>
        <button class="favorite-button is-active" type="button" data-place-id="${escapeHtml(place.id)}" aria-label="取消收藏">♥</button>
      </article>
    `).join("");

    bindFavoriteButtons(recentElement);
  }

  function renderFavoritesShelf() {
    const container = document.getElementById("favoritesShelf");
    if (!container || !state.dataset) {
      return;
    }

    const favoritePlaces = getFavoritePlaces();
    if (!favoritePlaces.length) {
      container.innerHTML = `
        <div class="list-empty">
          <img src="./assets/images/white-socks-cat.svg" alt="白襪貓">
          <p>還沒有收進任何地方，先去挑一個想去的景點吧。</p>
        </div>
      `;
      return;
    }

    container.innerHTML = favoritePlaces.map((place) => `
      <article class="place-tile place-tile--favorite" data-place-card="true" data-place-id="${escapeHtml(place.id)}">
        ${renderManagedImage({
          className: "place-tile__image",
          src: place.image,
          fallbackSrc: getPlaceFallbackImage(place),
          alt: place.name
        })}
        <div class="place-tile__body">
          <div class="place-tile__top">
            <div>
              <h3>${escapeHtml(place.name)}</h3>
              <p>${escapeHtml(place.country.name)} ・ ${escapeHtml(place.city.name)}</p>
            </div>
            <button class="favorite-button is-active" type="button" data-place-id="${escapeHtml(place.id)}" aria-label="取消收藏">♥</button>
          </div>
          <p class="place-tile__summary">${escapeHtml(place.summary)}</p>
          <div class="place-tile__meta">
            <span class="meta-pill">${escapeHtml(place.category.name)}</span>
            <span class="meta-pill">評分 ${Number(place.rating || 0).toFixed(1)}</span>
          </div>
        </div>
      </article>
    `).join("");

    bindFavoriteButtons(container);
    bindFavoritesShelfEvents(container);
  }

  function bindFavoritesShelfEvents(container) {
    if (container.dataset.bound === "true") {
      return;
    }

    container.dataset.bound = "true";
    container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const favoriteButton = target.closest(".favorite-button");
      if (favoriteButton instanceof HTMLElement && favoriteButton.dataset.placeId) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(favoriteButton.dataset.placeId);
        return;
      }

      const card = target.closest("[data-place-card]");
      if (card instanceof HTMLElement && card.dataset.placeId) {
        openPlaceModal(card.dataset.placeId);
      }
    });
  }

  function renderFavoritesGroups() {
    const cityContainer = document.getElementById("favoritesByCity");
    const categoryContainer = document.getElementById("favoritesByCategory");
    if ((!cityContainer && !categoryContainer) || !state.dataset) {
      return;
    }

    const favoritePlaces = getFavoritePlaces();
    const groupedByCity = new Map();
    const groupedByCategory = new Map();

    favoritePlaces.forEach((place) => {
      if (!groupedByCity.has(place.cityId)) {
        groupedByCity.set(place.cityId, {
          title: `${place.city.name} ・ ${place.country.name}`,
          items: []
        });
      }
      groupedByCity.get(place.cityId).items.push(place.name);

      if (!groupedByCategory.has(place.categoryId)) {
        groupedByCategory.set(place.categoryId, {
          title: place.category.name,
          items: []
        });
      }
      groupedByCategory.get(place.categoryId).items.push(place.name);
    });

    const renderGroupCards = (groups, emptyText) => {
      if (!groups.length) {
        return `<div class="list-empty"><p>${escapeHtml(emptyText)}</p></div>`;
      }

      return groups.map((group) => `
        <article class="archive-card">
          <strong>${escapeHtml(group.title)}</strong>
          <span>${group.items.length} 個收藏</span>
          <p>${escapeHtml(group.items.slice(0, 3).join(" ・ "))}</p>
        </article>
      `).join("");
    };

    if (cityContainer) {
      const cityGroups = Array.from(groupedByCity.values()).sort((a, b) => b.items.length - a.items.length);
      cityContainer.innerHTML = renderGroupCards(cityGroups, "收藏之後，這裡會慢慢長出城市名單。");
    }

    if (categoryContainer) {
      const categoryGroups = Array.from(groupedByCategory.values()).sort((a, b) => b.items.length - a.items.length);
      categoryContainer.innerHTML = renderGroupCards(categoryGroups, "收藏之後，這裡會整理出你的偏好類型。");
    }
  }

  function getFavoriteCityDetails() {
    if (!state.dataset) {
      return [];
    }

    const favoritePlaces = getFavoritePlaces();
    const favoriteCityMap = new Map();

    favoritePlaces.forEach((place) => {
      const existing = favoriteCityMap.get(place.cityId);
      if (existing) {
        existing.count += 1;
        if (!existing.highlights.includes(place.name) && existing.highlights.length < 3) {
          existing.highlights.push(place.name);
        }
        return;
      }

      favoriteCityMap.set(place.cityId, {
        cityId: place.cityId,
        cityName: place.city.name,
        countryName: place.country.name,
        countryId: place.countryId,
        count: 1,
        highlights: [place.name]
      });
    });

    return Array.from(favoriteCityMap.values()).sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.cityName.localeCompare(right.cityName, "zh-Hant");
    });
  }

  function renderTravelMap() {
    const pinsElement = document.getElementById("travelMapPins");
    const notesElement = document.getElementById("travelMapNotes");

    if (!pinsElement || !notesElement || !state.dataset) {
      return;
    }

    const favoritePlaces = getFavoritePlaces();
    const favoriteCityMap = new Map();

    favoritePlaces.forEach((place) => {
      const existing = favoriteCityMap.get(place.cityId);
      if (existing) {
        existing.count += 1;
        return;
      }

      favoriteCityMap.set(place.cityId, {
        cityId: place.cityId,
        cityName: place.city.name,
        countryName: place.country.name,
        countryId: place.countryId,
        count: 1,
        highlights: [place.name]
      });
    });

    const favoriteCities = Array.from(favoriteCityMap.values()).sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.cityName.localeCompare(right.cityName, "zh-Hant");
    });

    const favoriteCountries = state.dataset.countries.filter((country) =>
      favoriteCities.some((item) => item.countryId === country.id)
    );

    pinsElement.querySelectorAll(".map-pin").forEach((pin) => pin.remove());

    favoriteCountries.forEach((country) => {
      const pin = document.createElement("span");
      pin.className = "map-pin map-pin--visited";
      pin.style.left = `${country.pin.x}%`;
      pin.style.top = `${country.pin.y}%`;
      pin.title = country.name;
      pinsElement.appendChild(pin);
    });

    notesElement.innerHTML = activeCountries.map((country) => {
      const count = state.dataset.attractions.filter((item) => item.countryId === country.id).length;
      return `
        <div class="map-note">
          <strong>${escapeHtml(country.name)}</strong>
          <span>${count} 個景點</span>
        </div>
      `;
    }).join("");
  }

  function renderTravelMap() {
    const pinsElement = document.getElementById("travelMapPins");
    const notesElement = document.getElementById("travelMapNotes");

    if (!pinsElement || !notesElement || !state.dataset) {
      return;
    }

    const favoritePlaces = getFavoritePlaces();
    const favoriteCities = getFavoriteCityDetails();

    const favoriteCountries = state.dataset.countries.filter((country) =>
      favoriteCities.some((item) => item.countryId === country.id)
    );

    pinsElement.querySelectorAll(".map-pin").forEach((pin) => pin.remove());

    favoriteCountries.forEach((country) => {
      const pin = document.createElement("span");
      pin.className = "map-pin map-pin--visited";
      pin.style.left = `${country.pin.x}%`;
      pin.style.top = `${country.pin.y}%`;
      pin.title = country.name;
      pinsElement.appendChild(pin);
    });

    if (!favoriteCities.length) {
      notesElement.innerHTML = `
        <div class="map-note map-note--summary">
          <strong>還沒有留下足跡</strong>
          <span>先收藏一個景點，這張地圖就會開始記錄你的旅行。</span>
        </div>
      `;
      return;
    }

    notesElement.innerHTML = [
      `
        <div class="map-note map-note--summary">
          <strong>已留下 ${favoriteCities.length} 個城市的足跡</strong>
          <span>${favoritePlaces.length} 個景點，正在慢慢連成你的旅行路線。</span>
        </div>
      `,
      ...favoriteCities.map((city) => `
        <div class="map-note">
          <div class="map-note__body">
            <strong>${escapeHtml(city.cityName)}</strong>
            <em>${escapeHtml(city.countryName)}</em>
            <span>${escapeHtml(city.highlights.join(" ・ "))}</span>
          </div>
          <b>${city.count}</b>
        </div>
      `)
    ].join("");
  }

  function renderMapFootprints() {
    const container = document.getElementById("mapFootprintList");
    if (!container || !state.dataset) {
      return;
    }

    const favoriteCities = getFavoriteCityDetails();
    if (!favoriteCities.length) {
      container.innerHTML = `
        <div class="list-empty">
          <p>還沒有城市足跡，先收藏一個地方，這裡就會開始長出你的旅行地圖。</p>
        </div>
      `;
      return;
    }

    container.innerHTML = favoriteCities.map((city) => `
      <article class="footprint-card">
        <div class="footprint-card__top">
          <div>
            <h3>${escapeHtml(city.cityName)}</h3>
            <p>${escapeHtml(city.countryName)}</p>
          </div>
          <b>${city.count}</b>
        </div>
        <span class="footprint-card__label">這次收進來的地方</span>
        <p class="footprint-card__summary">${escapeHtml(city.highlights.join(" ・ "))}</p>
      </article>
    `).join("");
  }

  function renderStats() {
    const container = document.getElementById("statsGrid");
    if (!container || !state.dataset) {
      return;
    }

    const stats = [
      { label: "國家", number: state.dataset.countries.length, note: "已收錄" },
      { label: "城市", number: state.dataset.cities.length, note: "已收錄" },
      { label: "景點", number: state.dataset.attractions.length, note: "目前資料" },
      { label: "收藏", number: state.favorites.size, note: "我的清單" }
    ];

    container.innerHTML = stats.map((item) => `
      <article class="stat-card">
        <span class="stat-label">${escapeHtml(item.label)}</span>
        <strong class="stat-number">${item.number}</strong>
        <div class="stat-note">${escapeHtml(item.note)}</div>
      </article>
    `).join("");
  }

  function renderCollectorPreview() {
    const element = document.getElementById("collectorPreview");
    if (!element) {
      return;
    }

    if (!state.collector.length) {
      element.innerHTML = `
        <div class="collector-note">
          <h4>幫我整理資料</h4>
          <p>想留的地方，先放這裡。</p>
        </div>
      `;
      return;
    }

    const latest = state.collector[0];
    element.innerHTML = `
      <div class="saved-item">
        <h4>最新整理項目</h4>
        <div class="saved-item__body">
          <strong>${escapeHtml(latest.title)}</strong>
          <p>${escapeHtml(latest.note || "已加入待整理清單")}</p>
          <div class="saved-item__meta">
            <span class="meta-pill">${escapeHtml(latest.type)}</span>
            <span class="meta-pill">${escapeHtml(latest.country || "未指定國家")}</span>
            <span class="meta-pill">${escapeHtml(latest.city || "未指定城市")}</span>
          </div>
        </div>
      </div>
    `;
  }

  function populateExploreFilters() {
    if (!state.dataset) {
      return;
    }

    populateSelect(
      document.getElementById("filterCountry"),
      "全部國家",
      state.dataset.countries.map((item) => ({ value: item.id, label: item.name }))
    );

    const selectedCountry = document.getElementById("filterCountry")?.value || "";
    const cities = state.dataset.cities
      .filter((item) => !selectedCountry || item.countryId === selectedCountry)
      .map((item) => ({ value: item.id, label: item.name }));

    populateSelect(document.getElementById("filterCity"), "全部城市", cities);
    populateSelect(
      document.getElementById("filterCategory"),
      "全部分類",
      state.dataset.categories.map((item) => ({ value: item.id, label: item.name }))
    );
  }

  function bindExploreFilters() {
    ["filterCountry", "filterCity", "filterCategory"].forEach((id) => {
      const element = document.getElementById(id);
      if (!element) {
        return;
      }

      element.addEventListener("change", () => {
        if (id === "filterCountry") {
          populateExploreFilters();
        }
        syncExploreQuickFilters();
        renderExploreResults();
      });
    });
  }

  function bindExploreQuickFilters() {
    const container = document.getElementById("exploreQuickFilters");
    if (!container || container.dataset.bound === "true") {
      syncExploreQuickFilters();
      return;
    }

    container.dataset.bound = "true";
    container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const button = target.closest("[data-quick-city]");
      if (!(button instanceof HTMLElement)) {
        return;
      }

      applyExploreQuickCity(button.dataset.quickCity || "");
    });

    syncExploreQuickFilters();
  }

  function applyExploreQuickCity(cityId) {
    const country = document.getElementById("filterCountry");
    const city = document.getElementById("filterCity");

    if (country) {
      country.value = cityId ? "taiwan" : "";
    }

    populateExploreFilters();

    if (city) {
      city.value = cityId || "";
    }

    syncExploreQuickFilters();
    renderExploreResults();
  }

  function syncExploreQuickFilters() {
    const activeCityId = document.getElementById("filterCity")?.value || "";
    const buttons = document.querySelectorAll("#exploreQuickFilters [data-quick-city]");

    buttons.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return;
      }

      const shouldBeActive = (button.dataset.quickCity || "") === activeCityId;
      button.classList.toggle("is-active", shouldBeActive);
    });
  }

  function bindExploreActions() {
    const clearButton = document.getElementById("clearExploreFilters");
    if (!clearButton || clearButton.dataset.bound === "true") {
      return;
    }

    clearButton.dataset.bound = "true";
    clearButton.addEventListener("click", () => {
      resetExploreFilters();
      renderExploreResults();
      showToast("已清除篩選");
    });
  }

  function bindExploreResultEvents() {
    const container = document.getElementById("directoryResults");
    if (!container || container.dataset.bound === "true") {
      return;
    }

    container.dataset.bound = "true";
    container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const favoriteButton = target.closest(".favorite-button");
      if (favoriteButton instanceof HTMLElement && favoriteButton.dataset.placeId) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(favoriteButton.dataset.placeId);
        return;
      }

      const card = target.closest("[data-place-card]");
      if (card instanceof HTMLElement && card.dataset.placeId) {
        openPlaceModal(card.dataset.placeId);
      }
    });
  }

  function renderExploreResults() {
    const container = document.getElementById("directoryResults");
    const summary = document.getElementById("directorySummary");
    const activeFilters = document.getElementById("activeFilterTags");

    if (!container || !summary || !state.dataset) {
      return;
    }

    const filters = getExploreFilters();
    const results = state.dataset.attractions.filter((place) => {
      const searchText = [
        place.name,
        place.city?.name,
        place.country?.name,
        place.category?.name,
        place.summary,
        place.recommendedReason,
        place.note
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesQuery = !filters.query || searchText.includes(filters.query);
      const matchesCountry = !filters.countryId || place.countryId === filters.countryId;
      const matchesCity = !filters.cityId || place.cityId === filters.cityId;
      const matchesCategory = !filters.categoryId || place.categoryId === filters.categoryId;

      return matchesQuery && matchesCountry && matchesCity && matchesCategory;
    });

    const activeFilterLabels = buildExploreFilterLabels(filters);
    summary.textContent = `共 ${results.length} 個景點`;
    if (activeFilters) {
      activeFilters.innerHTML = activeFilterLabels.length
        ? activeFilterLabels.map((label) => `<span class="tag">${escapeHtml(label)}</span>`).join("")
        : `<span class="tag tag--muted">目前沒有套用篩選</span>`;
    }

    if (!results.length) {
      container.innerHTML = `
        <div class="list-empty">
          <p>目前沒有符合條件的景點，換個關鍵字試試看。</p>
        </div>
      `;
      return;
    }

    container.innerHTML = results.map((place) => renderExploreSpotCard(place)).join("");
  }

  function getExploreFilters() {
    return {
      query: (document.getElementById("exploreSearchInput")?.value || "").trim().toLowerCase(),
      countryId: document.getElementById("filterCountry")?.value || "",
      cityId: document.getElementById("filterCity")?.value || "",
      categoryId: document.getElementById("filterCategory")?.value || ""
    };
  }

  function buildExploreFilterLabels(filters) {
    if (!state.dataset) {
      return [];
    }

    const labels = [];
    if (filters.query) {
      labels.push(`搜尋：${filters.query}`);
    }
    if (filters.countryId) {
      labels.push(`國家：${state.dataset.countriesById[filters.countryId]?.name || filters.countryId}`);
    }
    if (filters.cityId) {
      labels.push(`城市：${state.dataset.citiesById[filters.cityId]?.name || filters.cityId}`);
    }
    if (filters.categoryId) {
      labels.push(`分類：${state.dataset.categoriesById[filters.categoryId]?.name || filters.categoryId}`);
    }
    return labels;
  }

  function resetExploreFilters() {
    const searchInput = document.getElementById("exploreSearchInput");
    const country = document.getElementById("filterCountry");
    const city = document.getElementById("filterCity");
    const category = document.getElementById("filterCategory");

    if (searchInput) searchInput.value = "";
    if (country) country.value = "";
    populateExploreFilters();
    if (city) city.value = "";
    if (category) category.value = "";
    syncExploreQuickFilters();
  }

  function renderPlannerPageCard(item) {
    return `
      <article class="saved-item">
        <h4>${escapeHtml(item.title)}</h4>
        <div class="saved-item__body">
          <p>${escapeHtml(item.note || "已加入待整理清單")}</p>
          <div class="saved-item__meta">
            <span class="meta-pill">${escapeHtml(item.type)}</span>
            <span class="meta-pill">${escapeHtml(item.country || "未指定國家")}</span>
            <span class="meta-pill">${escapeHtml(item.city || "未指定城市")}</span>
          </div>
        </div>
      </article>
    `;
  }

  function bindCollectorForm() {
    const form = document.getElementById("collectorForm");
    if (!form) {
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const formData = new FormData(form);
      const title = String(formData.get("title") || "").trim();
      if (!title) {
        showToast("請先輸入想整理的資料");
        return;
      }

      const item = {
        id: `collector-${Date.now()}`,
        title,
        type: String(formData.get("type") || "景點"),
        country: String(formData.get("country") || "").trim(),
        city: String(formData.get("city") || "").trim(),
        note: String(formData.get("note") || "").trim(),
        createdAt: new Date().toISOString()
      };

      state.collector = [item, ...state.collector].slice(0, 20);
      saveStorage(STORAGE_KEYS.collector, state.collector);
      form.reset();
      renderCollectorList();
      renderCollectorPreview();
      renderLocalSummary();
      showToast("已加入待整理清單");
    });
  }

  function renderCollectorList() {
    const container = document.getElementById("savedCollectorList");
    if (!container) {
      return;
    }

    if (!state.collector.length) {
      container.innerHTML = `<div class="planner-empty">目前還沒有待整理資料。</div>`;
      return;
    }

    container.innerHTML = state.collector.map((item) => renderPlannerPageCard(item)).join("");
  }

  function renderLocalSummary() {
    const container = document.getElementById("localSummary");
    if (!container || !state.dataset) {
      return;
    }

    const lines = [
      { label: "國家", value: state.dataset.countries.length, note: "已留下足跡" },
      { label: "城市", value: state.dataset.cities.length, note: "已收進名單" },
      { label: "景點", value: state.dataset.attractions.length, note: "目前收進來的地方" },
      { label: "收藏", value: state.favorites.size, note: "最近留下的清單" },
      { label: "待整理", value: state.collector.length, note: "還想回頭看看" }
    ];

    container.className = "settings-summary-list";
    container.innerHTML = lines.map((item) => `
      <li class="settings-summary-item">
        <div>
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.note)}</span>
        </div>
        <b>${escapeHtml(item.value)}</b>
      </li>
    `).join("");
  }

  function bindFavoriteButtons(scope) {
    scope.querySelectorAll("button[data-place-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(button.dataset.placeId);
      });
    });
  }

  function toggleFavorite(placeId) {
    if (!placeId || !state.dataset) {
      return;
    }

    if (state.favorites.has(placeId)) {
      state.favorites.delete(placeId);
      showToast("已移出收藏");
    } else {
      state.favorites.add(placeId);
      showToast("🐾 已加入我的清單");
    }

    saveStorage(STORAGE_KEYS.favorites, Array.from(state.favorites));
    refreshFavoritesUI({ keepModal: Boolean(state.selectedPlaceId) });
  }

  function refreshFavoritesUI(options = {}) {
    if (document.getElementById("featuredPlaces") && state.dataset) {
      renderFeaturedPlaces(document.getElementById("featuredPlaces"), getHomeFeaturedPlaces());
    }

    renderFavoritesPanel();
    renderFavoritesShelf();
    renderFavoritesGroups();
    renderStats();
    renderExploreResults();
    renderTravelMap();
    renderMapFootprints();
    renderLocalSummary();

    if (options.keepModal && state.selectedPlaceId) {
      openPlaceModal(state.selectedPlaceId);
    }
  }

  function getFavoritePlaces() {
    if (!state.dataset) {
      return [];
    }

    return state.dataset.attractions.filter((place) => state.favorites.has(place.id));
  }

  function renderHomeSpotCard(place) {
    const favoriteClass = state.favorites.has(place.id) ? "favorite-button is-active" : "favorite-button";

    return `
      <article class="spot-card">
        ${renderManagedImage({
          className: "spot-card__image",
          src: place.image,
          fallbackSrc: getPlaceFallbackImage(place),
          alt: place.name
        })}
        <div class="spot-card__body">
          <div class="spot-card__top">
            <div>
              <h3>${escapeHtml(place.name)}</h3>
              <p>${escapeHtml(place.country.name)} ・ ${escapeHtml(place.city.name)}</p>
            </div>
            <button class="${favoriteClass}" type="button" data-place-id="${escapeHtml(place.id)}" aria-label="切換收藏">♥</button>
          </div>
          <p class="spot-card__summary">${escapeHtml(place.summary)}</p>
          <div class="spot-rating">
            <span>評分 ${Number(place.rating || 0).toFixed(1)}</span>
            <span>・</span>
            <span>${escapeHtml(place.category.name)}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderExploreSpotCard(place) {
    const favoriteClass = state.favorites.has(place.id) ? "favorite-button is-active" : "favorite-button";

    return `
      <article class="spot-card spot-card--interactive" data-place-card="true" data-place-id="${escapeHtml(place.id)}">
        ${renderManagedImage({
          className: "spot-card__image",
          src: place.image,
          fallbackSrc: getPlaceFallbackImage(place),
          alt: place.name
        })}
        <div class="spot-card__body">
          <div class="spot-card__top">
            <div>
              <h3>${escapeHtml(place.name)}</h3>
              <p class="spot-card__meta-line">${escapeHtml(place.country.name)} ・ ${escapeHtml(place.city.name)}</p>
            </div>
            <button class="${favoriteClass}" type="button" data-place-id="${escapeHtml(place.id)}" aria-label="切換收藏">♥</button>
          </div>
          <p class="spot-card__summary">${escapeHtml(place.summary)}</p>
          <div class="spot-card__info-list">
            <span class="spot-card__info-item">${escapeHtml(place.category.name)}</span>
            <span class="spot-card__info-item">評分 ${Number(place.rating || 0).toFixed(1)}</span>
            <span class="spot-card__info-item">${escapeHtml(place.openingHours || "營業時間待補")}</span>
          </div>
        </div>
      </article>
    `;
  }

  function openPlaceModal(placeId) {
    const modal = document.getElementById("placeModal");
    const content = document.getElementById("placeModalContent");
    const place = state.dataset?.attractions.find((item) => item.id === placeId);

    if (!modal || !content || !place || !state.dataset) {
      return;
    }

    state.selectedPlaceId = placeId;
    const isFavorite = state.favorites.has(placeId);
    const relatedByCity = state.dataset.attractions
      .filter((item) => item.id !== place.id && item.cityId === place.cityId)
      .slice(0, 4);
    const relatedByCategory = state.dataset.attractions
      .filter((item) => item.id !== place.id && item.categoryId === place.categoryId && item.cityId !== place.cityId)
      .slice(0, 4);

    content.innerHTML = `
      <div class="place-modal__header">
        ${renderManagedImage({
          className: "place-modal__image",
          src: place.image,
          fallbackSrc: getPlaceFallbackImage(place),
          alt: place.name,
          eager: true
        })}
        <div>
          <span class="hero-eyebrow place-modal__eyebrow">${escapeHtml(place.category.name)}</span>
          <h2 id="placeModalTitle">${escapeHtml(place.name)}</h2>
          <p>${escapeHtml(place.country.name)} ・ ${escapeHtml(place.city.name)}</p>
          <p class="place-modal__summary">${escapeHtml(place.summary || "這個景點的摘要之後可以再補更完整。")}</p>
          <div class="place-modal__pill-row">
            <span class="meta-pill">評分 ${Number(place.rating || 0).toFixed(1)}</span>
            <span class="meta-pill">${escapeHtml(place.openingHours || "營業時間待補")}</span>
            <span class="meta-pill">${escapeHtml(place.ticketInfo || "票價待補")}</span>
          </div>
        </div>
      </div>

      <div class="place-modal__details">
        ${renderModalDetail("地址", place.address)}
        ${renderModalDetail("營業時間", place.openingHours)}
        ${renderModalDetail("電話", place.phone)}
        ${renderModalDetail("門票資訊", place.ticketInfo)}
      </div>

      <div class="place-modal__section-grid">
        ${renderModalSection("為什麼值得排進去", place.recommendedReason)}
        ${renderModalSection("交通怎麼接", place.transport)}
        ${renderModalSection("自己的備註", place.note)}
        ${renderModalSection("資料來源", place.source)}
      </div>

      <div class="spot-card__actions">
        <button class="secondary-button" type="button" data-modal-favorite="${escapeHtml(place.id)}">${isFavorite ? "已收藏" : "加入收藏"}</button>
        <button class="ghost-button" type="button" data-browse-mode="city">看同城市景點</button>
        <button class="ghost-button" type="button" data-browse-mode="category">看同分類景點</button>
        ${place.googleMapsUrl ? `<a class="inline-button" href="${escapeHtml(place.googleMapsUrl)}" target="_blank" rel="noreferrer">Google Maps</a>` : ""}
        ${place.officialWebsite ? `<a class="inline-button" href="${escapeHtml(place.officialWebsite)}" target="_blank" rel="noreferrer">官方網站</a>` : ""}
      </div>

      ${renderRelatedSection("同城市還可以順路看", relatedByCity)}
      ${renderRelatedSection("同分類也能這樣排", relatedByCategory)}
    `;

    modal.classList.add("is-open");
    document.body.classList.add("modal-open");
  }

  function renderRelatedSection(title, places) {
    if (!places.length) {
      return "";
    }

    return `
      <section class="place-modal__related">
        <h3>${escapeHtml(title)}</h3>
        <div class="place-modal__related-list">
          ${places.map((place) => `
            <button class="place-modal__related-item" type="button" data-related-place-id="${escapeHtml(place.id)}">
              <strong>${escapeHtml(place.name)}</strong>
              <span>${escapeHtml(place.category.name)} ・ ${escapeHtml(place.city.name)}</span>
            </button>
          `).join("")}
        </div>
      </section>
    `;
  }

  function applyBrowseMode(placeId, mode) {
    const place = state.dataset?.attractions.find((item) => item.id === placeId);
    if (!place) {
      return;
    }

    const country = document.getElementById("filterCountry");
    const city = document.getElementById("filterCity");
    const category = document.getElementById("filterCategory");
    const searchInput = document.getElementById("exploreSearchInput");

    if (searchInput) {
      searchInput.value = "";
    }

    if (country) {
      country.value = place.countryId;
    }
    populateExploreFilters();

    if (mode === "city") {
      if (city) {
        city.value = place.cityId;
      }
      if (category) {
        category.value = "";
      }
      showToast(`改看 ${place.city.name} 的景點`);
    }

    if (mode === "category") {
      if (city) {
        city.value = "";
      }
      if (category) {
        category.value = place.categoryId;
      }
      showToast(`改看 ${place.category.name}`);
    }

    renderExploreResults();
    closePlaceModal();
    scrollExploreResultsIntoView();
  }

  function scrollExploreResultsIntoView() {
    const panel = document.getElementById("directoryResults");
    if (panel) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderModalDetail(label, value) {
    return `
      <div class="detail-item">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(value || "待補")}</span>
      </div>
    `;
  }

  function renderModalSection(title, value) {
    return `
      <article class="place-modal__section">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(value || "待補")}</p>
      </article>
    `;
  }

  function renderModalLinkDetail(label, href, text) {
    return `
      <div class="detail-item">
        <strong>${escapeHtml(label)}</strong>
        ${href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(text)}</a>`
          : `<span>${escapeHtml("未提供")}</span>`}
      </div>
    `;
  }

  function openPlaceModal(placeId) {
    const modal = document.getElementById("placeModal");
    const content = document.getElementById("placeModalContent");
    const place = state.dataset?.attractions.find((item) => item.id === placeId);

    if (!modal || !content || !place || !state.dataset) {
      return;
    }

    state.selectedPlaceId = placeId;
    const isFavorite = state.favorites.has(placeId);
    const relatedByCity = state.dataset.attractions
      .filter((item) => item.id !== place.id && item.cityId === place.cityId)
      .slice(0, 4);
    const relatedByCategory = state.dataset.attractions
      .filter((item) => item.id !== place.id && item.categoryId === place.categoryId && item.cityId !== place.cityId)
      .slice(0, 4);

    content.innerHTML = `
      <div class="place-modal__header">
        ${renderManagedImage({
          className: "place-modal__image",
          src: place.image,
          fallbackSrc: getPlaceFallbackImage(place),
          alt: place.name,
          eager: true
        })}
        <div>
          <span class="hero-eyebrow place-modal__eyebrow">${escapeHtml(place.category.name)}</span>
          <h2 id="placeModalTitle">${escapeHtml(place.name)}</h2>
          <p>${escapeHtml(place.country.name)} / ${escapeHtml(place.city.name)}</p>
          <p class="place-modal__summary">${escapeHtml(place.summary || "暫無介紹")}</p>
          <div class="place-modal__pill-row">
            <span class="meta-pill">評分 ${Number(place.rating || 0).toFixed(1)}</span>
            <span class="meta-pill">${escapeHtml(place.openingHours || "未提供")}</span>
            <span class="meta-pill">${escapeHtml(place.ticketInfo || "門票資訊未提供")}</span>
          </div>
        </div>
      </div>

      <div class="place-modal__details">
        ${renderModalDetail("國家 / 城市", `${place.country.name} / ${place.city.name}`)}
        ${renderModalDetail("分類", place.category.name)}
        ${renderModalDetail("地址", place.address)}
        ${renderModalDetail("營業時間", place.openingHours)}
        ${renderModalDetail("電話", place.phone)}
        ${renderModalLinkDetail("Google Maps", place.googleMapsUrl, "查看地圖")}
        ${renderModalLinkDetail("官網", place.officialWebsite, "前往官網")}
      </div>

      <div class="place-modal__section-grid">
        ${renderModalSection("推薦原因", place.recommendedReason)}
        ${renderModalSection("交通方式", place.transport)}
        ${renderModalSection("我的備註", place.note)}
        ${renderModalSection("資料來源", place.source)}
      </div>

      <div class="spot-card__actions">
        <button class="secondary-button" type="button" data-modal-favorite="${escapeHtml(place.id)}">${isFavorite ? "已收藏" : "加入收藏"}</button>
        <button class="ghost-button" type="button" data-browse-mode="city">看同城市景點</button>
        <button class="ghost-button" type="button" data-browse-mode="category">看同分類景點</button>
        ${place.googleMapsUrl ? `<a class="inline-button" href="${escapeHtml(place.googleMapsUrl)}" target="_blank" rel="noreferrer">Google Maps</a>` : ""}
        ${place.officialWebsite ? `<a class="inline-button" href="${escapeHtml(place.officialWebsite)}" target="_blank" rel="noreferrer">官網</a>` : ""}
      </div>

      ${renderRelatedSection("同城市還可以順路看", relatedByCity)}
      ${renderRelatedSection("同分類也能這樣排", relatedByCategory)}
    `;

    modal.classList.add("is-open");
    document.body.classList.add("modal-open");
  }

  function closePlaceModal() {
    const modal = document.getElementById("placeModal");
    if (!modal) {
      return;
    }

    modal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    state.selectedPlaceId = null;
  }

  function populateSelect(element, defaultLabel, options) {
    if (!element) {
      return;
    }

    const currentValue = element.value;
    element.innerHTML = [
      `<option value="">${escapeHtml(defaultLabel)}</option>`,
      ...options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`)
    ].join("");

    if (currentValue && options.some((option) => option.value === currentValue)) {
      element.value = currentValue;
    }
  }

  function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
      overlay.classList.add("is-hidden");
    }
  }

  function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 1400);
  }

  function readStorage(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(error);
      return fallback;
    }
  }

  function saveStorage(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function getCountryFallbackImage(countryId) {
    return IMAGE_FALLBACKS.countries[countryId] || IMAGE_FALLBACKS.generic;
  }

  function getPlaceFallbackImage(place) {
    if (!place || !place.countryId) {
      return IMAGE_FALLBACKS.generic;
    }

    return getCountryFallbackImage(place.countryId);
  }

  function getPreferredImage(src, fallbackSrc) {
    if (typeof src === "string" && src.trim()) {
      return src;
    }

    return fallbackSrc;
  }

  function renderManagedImage({ className = "", src, fallbackSrc, alt, eager = true }) {
    const safeFallback = fallbackSrc || IMAGE_FALLBACKS.generic;
    const safeSrc = getPreferredImage(src, safeFallback);
    const loading = eager ? "eager" : "lazy";
    const classAttr = className ? ` class="${escapeHtml(className)}"` : "";

    return `<img${classAttr} src="${escapeHtml(safeSrc)}" data-fallback-src="${escapeHtml(safeFallback)}" loading="${loading}" alt="${escapeHtml(alt || "")}">`;
  }

  window.TripAtlasApp = {
    openPlaceModal,
    closePlaceModal
  };
})();
