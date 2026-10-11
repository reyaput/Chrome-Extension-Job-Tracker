(async () => {
  "use strict";

  // Microdata Kalibrr dan posting publik LinkedIn diperiksa pada 11 Oktober 2026.
  // Selector situs/varian lainnya masih kandidat; field yang hilang tetap null.
  // LinkedIn: cari panel detail kanan, termasuk /jobs/search-results/?currentJobId=….
  const SITE_SELECTORS = {
    linkedin: {
      container: [".jobs-search__job-details--container", ".jobs-details", ".job-view-layout", ".scaffold-layout__detail"],
      title: [".job-details-jobs-unified-top-card__job-title h1", ".jobs-unified-top-card__job-title", ".top-card-layout__title"],
      company: [".job-details-jobs-unified-top-card__company-name a", ".jobs-unified-top-card__company-name", ".topcard__org-name-link"],
      location: [".jobs-unified-top-card__bullet", ".topcard__flavor--bullet", "[data-test-job-location]"],
      workType: [".jobs-unified-top-card__workplace-type", "[data-test-job-workplace-type]"],
      salary: [".salary-main-rail__compensation-value", "[data-test-job-salary]"],
      deadline: ["time[data-test-job-deadline]", "[data-test-job-deadline]"],
      description: [".jobs-description__content", ".jobs-description-content__text", ".show-more-less-html__markup"]
    },
    jobstreet: {
      container: ["[data-automation='jobDetailsPage']", "[data-automation='jobAdDetails']"],
      title: ["[data-automation='job-detail-title']", "[data-automation='jobTitle']"],
      company: ["[data-automation='advertiser-name']", "[data-automation='jobCompany']"],
      location: ["[data-automation='job-detail-location']", "[data-automation='jobLocation']"],
      workType: ["[data-automation='job-detail-workplace-type']", "[data-automation='workplaceType']"],
      salary: ["[data-automation='job-detail-salary']", "[data-automation='jobSalary']"],
      deadline: ["time[data-automation='jobDeadline']", "[data-automation='job-detail-deadline']"],
      description: ["[data-automation='jobAdDetails']", "[data-automation='jobDescription']"]
    },
    glints: {
      container: ["[data-testid='job-details']", "#job-details"],
      title: ["[data-testid='job-title']", "[data-test='job-title']"],
      company: ["[data-testid='company-name']", "[data-test='company-name']"],
      location: ["[data-testid='job-location']", "[data-test='job-location']"],
      workType: ["[data-testid='workplace-type']", "[data-test='workplace-type']"],
      salary: ["[data-testid='job-salary']", "[data-test='job-salary']"],
      deadline: ["time[data-testid='job-deadline']", "[data-test='job-deadline']"],
      description: ["[data-testid='job-description']", "[data-test='job-description']"]
    },
    kalibrr: {
      container: ["[itemscope][itemtype$='/JobPosting']", ".k-job-details", "[data-testid='job-details']"],
      title: ["h1[itemprop='title']", ".k-job-details h1", "[data-testid='job-title']"],
      company: [".k-job-details .company-name", "[data-testid='company-name']"],
      location: [".k-job-details .job-location", "[data-testid='job-location']"],
      workType: [".k-job-details .workplace-type", "[data-testid='workplace-type']"],
      salary: [".k-job-details .job-salary", "[data-testid='job-salary']"],
      deadline: ["time[data-testid='job-deadline']", ".k-job-details .application-deadline"],
      description: [".k-job-details .job-description", "[data-testid='job-description']"]
    },
    indeed: {
      container: ["#jobsearch-ViewjobPaneWrapper", ".jobsearch-ViewJobLayout-jobDisplay", ".jobsearch-RightPane"],
      title: [".jobsearch-JobInfoHeader-title", "h1[data-testid='jobsearch-JobInfoHeader-title']"],
      company: ["[data-testid='inlineHeader-companyName']", ".jobsearch-InlineCompanyRating-companyHeader"],
      location: ["[data-testid='job-location']", ".jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-companyLocation"],
      workType: ["[data-testid='workplace-type']", ".jobsearch-JobInfoHeader-workplaceType"],
      salary: ["[data-testid='salary-snippet']", ".salary-snippet-container"],
      deadline: ["time[data-testid='job-deadline']", "[data-testid='application-deadline']"],
      description: ["#jobDescriptionText", ".jobsearch-jobDescriptionText"]
    }
  };

  function cleanText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  }

  function htmlToText(value, keepLines = false) {
    if (typeof value !== "string") return "";
    const parsed = new DOMParser().parseFromString(value, "text/html");
    parsed.querySelectorAll("script, style, noscript").forEach((element) => element.remove());
    // Pemisah mempertahankan batas kata pada paragraf dan baris yang berdampingan.
    const separator = keepLines ? "\n" : " ";
    parsed.querySelectorAll("br").forEach((element) => element.replaceWith(parsed.createTextNode(separator)));
    parsed.querySelectorAll("p, div, li, section, h1, h2, h3, h4, tr").forEach((element) => {
      element.appendChild(parsed.createTextNode(separator));
    });
    return keepLines ? parsed.body.textContent.replace(/\r\n?/g, "\n").trim() : cleanText(parsed.body.textContent);
  }

  function findElement(root, selectors = []) {
    for (const selector of selectors) {
      try {
        const elements = root.querySelectorAll(selector);
        for (const element of elements) {
          if (element.getClientRects().length && cleanText(element.innerText || element.textContent)) return element;
          if (element.getClientRects().length && element.getAttribute("datetime")) return element;
        }
      } catch {
        // Selector yang tidak cocok/tidak valid tidak menghentikan pengambilan.
      }
    }
    return null;
  }

  function readField(root, selectors, field) {
    const element = findElement(root, selectors);
    if (!element) return null;
    const value = field === "deadline" ? element.getAttribute("datetime") || element.innerText || element.textContent
      : element.innerText || element.textContent;
    return cleanText(value) || null;
  }

  function getSiteConfig(hostname) {
    if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) return SITE_SELECTORS.linkedin;
    for (const brand of ["jobstreet", "glints", "kalibrr", "indeed"]) {
      if (hostname.split(".").includes(brand)) return SITE_SELECTORS[brand];
    }
    return null;
  }

  function readMeta(selector) {
    return htmlToText(document.querySelector(selector)?.getAttribute("content") || "");
  }

  function readAddress(location) {
    if (!location || typeof location !== "object") return null;
    const source = location.address || {};
    return {
      address: {
        addressLocality: cleanText(source.addressLocality),
        addressRegion: cleanText(source.addressRegion),
        addressCountry: cleanText(typeof source.addressCountry === "string" ? source.addressCountry : source.addressCountry?.name)
      }
    };
  }

  function selectJobFields(job) {
    const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
    const organization = Array.isArray(job.hiringOrganization) ? job.hiringOrganization[0] : job.hiringOrganization;
    return {
      title: htmlToText(job.title),
      hiringOrganization: { name: htmlToText(organization?.name) },
      jobLocation: locations.map(readAddress).filter(Boolean),
      jobLocationType: job.jobLocationType || null,
      baseSalary: job.baseSalary ?? null,
      validThrough: typeof job.validThrough === "string" ? job.validThrough : "",
      description: htmlToText(job.description)
    };
  }

  function collectStructuredData(value, jobPostings, socialPosts) {
    if (Array.isArray(value)) {
      value.forEach((item) => collectStructuredData(item, jobPostings, socialPosts));
      return;
    }
    if (!value || typeof value !== "object") return;
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((type) => typeof type === "string" && /(?:^|[/#])JobPosting$/.test(type))) {
      jobPostings.push(selectJobFields(value));
    }
    if (types.some((type) => typeof type === "string" && /(?:^|[/#])SocialMediaPosting$/.test(type))) {
      socialPosts.push({ url: value["@id"] || value.url || "", text: htmlToText(value.articleBody, true) });
      return; // Komentar dan posting lama yang dibagikan ulang bukan posting utama.
    }
    // Penelusuran ini menangani @graph, array, dan objek terstruktur bersarang.
    Object.values(value).forEach((item) => collectStructuredData(item, jobPostings, socialPosts));
  }

  function readMicrodataJob(root) {
    // Atribut schema.org juga sah ketika nilainya berupa meta/elemen tersembunyi.
    // Jangan mengambil properti dari organisasi atau rekomendasi lain di luar scope ini.
    const value = (scope, prop) => {
      const element = scope?.querySelector(`[itemprop~='${prop}']`);
      return cleanText(element?.getAttribute("content") || element?.getAttribute("datetime") || element?.textContent);
    };
    const organization = root.querySelector("[itemprop~='hiringOrganization']");
    const locations = [...root.querySelectorAll("[itemprop~='jobLocation']")].map((place) => {
      const address = place.querySelector("[itemprop~='address']") || place;
      return { address: { addressLocality: value(address, "addressLocality"),
        addressRegion: value(address, "addressRegion"), addressCountry: value(address, "addressCountry") } };
    });
    return { title: value(root, "title"), hiringOrganization: { name: value(organization, "name") },
      jobLocation: locations, jobLocationType: value(root, "jobLocationType"),
      validThrough: value(root, "validThrough"), description: readField(root, ["[itemprop~='description']"], "description") };
  }

  const POST_ROOT_SELECTOR = ".main-feed-activity-card, .feed-shared-update-v2, [data-view-name='feed-full-update']";
  const POST_TEXT_SELECTORS = ["[data-test-id='main-feed-activity-card__commentary']", ".update-components-text",
    ".feed-shared-text", ".feed-shared-update-v2__description-wrapper"];

  function readLinkedInPost(socialPosts) {
    const path = decodeURIComponent(location.pathname);
    const id = path.match(/-(?:activity|share)-(\d+)(?:-|\/|$)/)?.[1] || path.match(/urn:li:(?:activity|share):(\d+)/)?.[1];
    const canonical = document.querySelector("link[rel='canonical']")?.href;
    const canonicalId = canonical?.match(/-(?:activity|share)-(\d+)(?:-|\/|$)/)?.[1];
    const ids = [id, canonicalId].filter(Boolean);
    const identityAttributes = ["data-activity-urn", "data-attributed-urn", "data-urn"];
    const roots = [...document.querySelectorAll(POST_ROOT_SELECTOR)].filter((element) => element.getClientRects().length &&
      !element.parentElement?.closest(POST_ROOT_SELECTOR));
    const matches = (element) => identityAttributes.some((attr) =>
      ids.some((postId) => element.getAttribute(attr)?.endsWith(`:${postId}`)));
    let root = roots.find(matches);
    // Launched post permalinks can use a share ID while the card uses an activity ID.
    // A single top-level card is safe; never choose the first of multiple feed cards.
    if (!root && roots.length === 1 && (!ids.length || !identityAttributes.some((attr) => roots[0].hasAttribute(attr)))) root = roots[0];
    for (const selector of POST_TEXT_SELECTORS) {
      for (const element of root?.querySelectorAll(selector) || []) {
        const quoted = element.closest(".feed-reshare-content, .feed-shared-mini-update-v2, [aria-label='Reshared post']");
        if (element.closest(POST_ROOT_SELECTOR) !== root || quoted || !element.getClientRects().length) continue;
        const text = (element.innerText || "").trim();
        if (text) return { text };
      }
    }
    const structured = socialPosts.find((post) => ids.some((postId) => post.url.includes(postId)) || (canonical && post.url === canonical)) ||
      (!ids.length && socialPosts.length === 1 && roots.length <= 1 ? socialPosts[0] : null);
    return { text: structured?.text || "" };
  }

  const hostname = location.hostname.toLowerCase();
  const config = getSiteConfig(hostname);
  const isLinkedInPost = config === SITE_SELECTORS.linkedin && /^\/(?:posts\/|feed\/update\/)/.test(location.pathname);

  function readPage() {
    const jobPostings = [], socialPosts = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try { collectStructuredData(JSON.parse(script.textContent), jobPostings, socialPosts); } catch {
        // JSON-LD rusak tidak menghentikan pembacaan DOM.
      }
    });
    const container = config ? findElement(document, config.container) : null;
    const root = container || document;
    const siteFields = {};
    for (const field of ["title", "company", "location", "workType", "salary", "deadline", "description"]) {
      siteFields[field] = !isLinkedInPost && config ? readField(root, config[field], field) : null;
    }
    if (!isLinkedInPost && container?.matches("[itemscope][itemtype$='/JobPosting']")) {
      jobPostings.push(readMicrodataJob(container));
      if (config === SITE_SELECTORS.kalibrr) {
        const title = findElement(root, ["h1[itemprop='title']"]);
        const header = title?.parentElement;
        siteFields.company ||= readField(header || root, ["a[href*='/c/'] h2"], "company");
        // Gaji diambil dari teks yang tampil, termasuk mata uang dan periodenya.
        const salaryRow = root.querySelector("[itemprop~='baseSalary']")?.closest("li");
        siteFields.salary ||= cleanText(salaryRow?.innerText) || null;
        siteFields.location ||= readField(header || root, ["span[itemtype$='/PostalAddress']"], "location");
      }
    }
    return {
      url: location.href, hostname, title: document.title,
      pageKind: isLinkedInPost ? "linkedin-post" : "job",
      post: isLinkedInPost ? readLinkedInPost(socialPosts) : null,
      meta: { ogTitle: readMeta('meta[property="og:title"]'), ogSiteName: readMeta('meta[property="og:site_name"]'),
        ogDescription: readMeta('meta[property="og:description"]'), description: readMeta('meta[name="description"]') },
      jobPostings, siteFields,
      hasPageText: Boolean((container?.innerText || document.body?.innerText || "").trim())
    };
  }

  let page = readPage();
  const ready = () => isLinkedInPost ? Boolean(page.post.text) : Boolean(page.jobPostings.some((job) => job.title) || page.siteFields.title);
  // SPA dapat menampilkan judul platform sebelum detail lowongan selesai dimuat.
  // Beri render yang sedang berjalan kesempatan selesai, dengan batas enam detik.
  if (config && !ready()) {
    const until = Date.now() + 6000;
    while (!ready() && Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      page = readPage();
    }
  }
  if (isLinkedInPost && !page.post.text) {
    page.extractionError = "Teks posting LinkedIn belum terbaca. Buka posting lengkap, tampilkan teks dengan See more / Lihat selengkapnya, dan login jika diminta. Lowongan yang hanya ada di gambar belum bisa dibaca otomatis.";
  }
  return page;
})();
