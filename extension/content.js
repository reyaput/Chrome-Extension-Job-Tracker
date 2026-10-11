(() => {
  "use strict";

  // SEMUA selector berikut adalah kandidat yang BELUM diverifikasi pada situs asli.
  // Nama kelas/atribut dapat berubah. Field yang tidak ditemukan mengembalikan null.
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
      container: [".k-job-details", "[data-testid='job-details']"],
      title: [".k-job-details h1", "[data-testid='job-title']"],
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

  function htmlToText(value) {
    if (typeof value !== "string") return "";
    const parsed = new DOMParser().parseFromString(value, "text/html");
    parsed.querySelectorAll("script, style, noscript").forEach((element) => element.remove());
    // Pemisah mempertahankan batas kata pada paragraf dan baris yang berdampingan.
    parsed.querySelectorAll("br").forEach((element) => element.replaceWith(parsed.createTextNode(" ")));
    parsed.querySelectorAll("p, div, li, section, h1, h2, h3, h4, tr").forEach((element) => {
      element.appendChild(parsed.createTextNode(" "));
    });
    return cleanText(parsed.body.textContent);
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

  const jobPostings = [];
  function collectJobPostings(value) {
    if (Array.isArray(value)) {
      value.forEach(collectJobPostings);
      return;
    }
    if (!value || typeof value !== "object") return;
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((type) => typeof type === "string" && /(?:^|[/#])JobPosting$/.test(type))) {
      jobPostings.push(selectJobFields(value));
    }
    // Penelusuran ini menangani @graph, array, dan objek terstruktur bersarang.
    Object.values(value).forEach(collectJobPostings);
  }

  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      collectJobPostings(JSON.parse(script.textContent));
    } catch {
      // JSON-LD yang rusak diabaikan; sumber lainnya tetap dapat digunakan.
    }
  });

  const hostname = location.hostname.toLowerCase();
  const config = getSiteConfig(hostname);
  const container = config ? findElement(document, config.container) : null;
  const root = container || document;
  const siteFields = {};
  for (const field of ["title", "company", "location", "workType", "salary", "deadline", "description"]) {
    siteFields[field] = config ? readField(root, config[field], field) : null;
  }

  return {
    url: location.href,
    hostname,
    title: document.title,
    meta: {
      ogTitle: readMeta('meta[property="og:title"]'),
      ogSiteName: readMeta('meta[property="og:site_name"]'),
      ogDescription: readMeta('meta[property="og:description"]'),
      description: readMeta('meta[name="description"]')
    },
    jobPostings,
    siteFields,
    jobText: (container?.innerText || document.body?.innerText || "").trim()
  };
})();
