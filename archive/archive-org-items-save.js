/* Global Variables */

const stats_curr_date  = "2025-07-23";
let   stats_curr_items = [];

const stats_prev_date  = "2025-07-21";
let   stats_prev_items = [];

/* Startup Run */

process_stats();

/* Items */

function filter_items(items, archived_min, archived_max, created_min, created_max) {
  const filtered_items = items
    .filter(doc => {
      const publicdate_node = doc.querySelector("str[name='publicdate']");
      const date_node       = doc.querySelector("str[name='date']"      );
      const downloads_node  = doc.querySelector("str[name='downloads']" );
      const month_node      = doc.querySelector("str[name='month']"     );
      const week_node       = doc.querySelector("str[name='week']"      );
      const mediatype_node  = doc.querySelector("str[name='mediatype']" );
      const identifier_node = doc.querySelector("str[name='identifier']");

      if (!publicdate_node ||
          !downloads_node  || !month_node || !week_node ||
          !mediatype_node  || !identifier_node) {
        return false;
      }

      // Archived
      const publicdate = new Date(publicdate_node.textContent);
      if (isNaN(publicdate.getTime())) return false;
      const archived_ok = (publicdate >= archived_min) && (publicdate <= archived_max);

      // Created
      const mediatype = mediatype_node.textContent;
      let   date      = null;

      if (!date_node) {
        if (mediatype === "audio") { // Set default date for audio items
          date = new Date("2012-01-01T00:00:00Z"); // UTC date, earliest for entire stats
        } else {
          return false;
        }
      } else {
        date = new Date(date_node.textContent);
        if (isNaN(date.getTime())) return false;
      }

      const created_ok = (date >= created_min) && (date <= created_max);

      // Views
      const downloads = parseInt(downloads_node.textContent, 10);
      const month     = parseInt(month_node    .textContent, 10);
      const week      = parseInt(week_node     .textContent, 10);

      if (isNaN(downloads) || isNaN(month) || isNaN(week)) return false;
      if ((downloads < month) || (month < week)) return false;

      // Mediatype
      const is_collection = (mediatype === "collection");
      const is_texts      = (mediatype === "texts"     );

      return archived_ok && created_ok && !is_collection && !is_texts;
  });
  return filtered_items;
}

function calculate_stats(filtered_items, stats_date) {
  const results = filtered_items.map(doc => {
    const publicdate = new Date(doc.querySelector("str[name='publicdate']").textContent);
    const downloads  = parseInt(doc.querySelector("str[name='downloads']" ).textContent, 10);
    const month      = parseInt(doc.querySelector("str[name='month']"     ).textContent, 10);
    const week       = parseInt(doc.querySelector("str[name='week']"      ).textContent, 10);
    const mediatype  =          doc.querySelector("str[name='mediatype']" ).textContent;
    const identifier =          doc.querySelector("str[name='identifier']").textContent;

    const calc_date  = new Date(stats_date + 'T12:00:00Z');
    const days_old   = Math.floor((calc_date - publicdate) / (24 * 60 * 60 * 1000)) - 30;
    const views_old  = downloads - month;
    const ratio_old  = parseFloat((views_old / days_old).toFixed(3));

    return {
      title    : doc.querySelector("str[name='title']")?.textContent || "Untitled",
      views_old,
      days_old ,
      ratio_old,
      views_23 :  month - week,
      ratio_23 : (month - week) / 23,
      views_7  : week,
      ratio_7  : week / 7,
      mediatype,
      identifier
    };
  });
  return results;
}

/* Display */

function render_results(results_curr, results_prev) {
  const container = document.getElementById("results");
        container.innerHTML = "";

  if (results_curr.length === 0) {
    container.innerHTML = '<div class="text-center text-comment">No items matched the filters</div>';
    return;
  }

  if (results_prev.length !== results_curr.length) {
    container.innerHTML = '<div class="text-center text-comment">Stats are different in items count</div>';
    return;
  }

  results_curr.sort((a, b) => { // Descending for views
    if (a.ratio_old !== b.ratio_old) { return b.ratio_old - a.ratio_old; }
    if (a.ratio_23  !== b.ratio_23 ) { return b.ratio_23  - a.ratio_23;  }
    if (a.ratio_7   !== b.ratio_7  ) { return b.ratio_7   - a.ratio_7;   }
    return a.title.localeCompare(b.title); // Ascending for titles: A >> Z
  });

  // Build a map of prev results by identifier
  const map_prev = {};
  results_prev.forEach(item => {
    map_prev[item.identifier] = item;
  });

  const mediatypeCounts = { movies: 0, audio: 0 };
  results_curr.forEach(item => {
    if (item.mediatype === "movies") mediatypeCounts.movies++;
    if (item.mediatype === "audio" ) mediatypeCounts.audio++;
  });

  const total = mediatypeCounts.movies + mediatypeCounts.audio;
  const countDiv = document.createElement("div");
  countDiv.className = "text-center subtitle";
  countDiv.textContent = 'Stats ' + stats_prev_date + ' – ' + stats_curr_date + ' / ' +
                         'Total ' + total + ' ' +
                        '(Audio ' + mediatypeCounts.audio  + ' / Video ' + mediatypeCounts.movies + ')';
  container.appendChild(countDiv);

  // Show stats: min, 10%, 25%, 50%, 75%, 90%, max
  const statsText = document.createElement("div");
  statsText.className = "text-center";
  statsText.style.color = "#696969"; // DimGray, L41

  // Calculate stats from sorted results
  const max = results_curr[0                      ]?.ratio_old || 0;
  const min = results_curr[results_curr.length - 1]?.ratio_old || 0;

  // Simple percentile approximations (array is already sorted)
  const getPercentile = (percent) => {
    const index = Math.floor((100 - percent) / 100 * results_curr.length);
    return results_curr[index]?.ratio_old || 0;
  };

  const percentile10 = getPercentile(10);
  const quartile1    = getPercentile(25);
  const median       = getPercentile(50);
  const quartile3    = getPercentile(75);
  const percentile90 = getPercentile(90);

  statsText.textContent = 'Min ' + min         .toFixed(3) + ' / ' +
                          '10% ' + percentile10.toFixed(3) + ' / ' +
                          '25% ' + quartile1   .toFixed(3) + ' / ' +
                          '50% ' + median      .toFixed(3) + ' / ' +
                          '75% ' + quartile3   .toFixed(3) + ' / ' +
                          '90% ' + percentile90.toFixed(3) + ' / ' +
                          'Max ' + max         .toFixed(3);

  container.appendChild(statsText);

  // Show item list with flex alignment
  results_curr.forEach((item, index) => {
    // 1. Outer wrapper (for spacing/divider)
    const wrapper = document.createElement("div");
    wrapper.className = "item-wrapper";

    // 2. Inner flex container
    const inner = document.createElement("div");
    inner.className = "item";

    // 3. Title
    const title = document.createElement("div");
    title.className   = "item-title";
    title.textContent = (index + 1) + ". " + item.title;

    // 4.0. Get matching prev item
    const item_prev = map_prev[item.identifier];

    // 4.1. Prev stats container (stacked)
    const stats_prev_container = document.createElement("div");
    stats_prev_container.className = "item-stats-container";

    // 4.2. Prev: old stat line
    const stat_prev_old = document.createElement("div");
    stat_prev_old.className   ="item-stat-main";
    stat_prev_old.textContent = item_prev.views_old.toString() + " /" +
                                item_prev.days_old .toString().padStart(5) + " =" +
                                item_prev.ratio_old.toFixed(3).padStart(7);

    // 4.3. Prev: 23-day stat line
    const stat_prev_23 = document.createElement("div");
    stat_prev_23.className   ="item-stat-23";
    stat_prev_23.textContent = item_prev.views_23.toString() + " /   23 =" +
                               item_prev.ratio_23.toFixed(3).padStart(7);

    // 4.4. Prev: 7-day stat line
    const stat_prev_7 = document.createElement("div");
    stat_prev_7.className   ="item-stat-7";
    stat_prev_7.textContent = item_prev.views_7.toString() + " /    7 =" +
                              item_prev.ratio_7.toFixed(3).padStart(7);

    // 4.5. Prev: assemble the hierarchy
    stats_prev_container.appendChild(stat_prev_old);
    stats_prev_container.appendChild(stat_prev_23 );
    stats_prev_container.appendChild(stat_prev_7  );

    // 5. Spacer between prev and curr
    const spacer = document.createElement("div");
    spacer.className = "item-spacer";
  //spacer.textContent = " "; // Optional: keeps layout consistent

    // 6.1. Curr stats container (stacked)
    const stats_curr_container = document.createElement("div");
    stats_curr_container.className = "item-stats-container";

    // 6.2. Curr: old stat line
    const stat_curr_old = document.createElement("div");
    stat_curr_old.className   ="item-stat-main";
    stat_curr_old.textContent = item.views_old.toString() + " /" +
                                item.days_old .toString().padStart(5) + " =" +
                                item.ratio_old.toFixed(3).padStart(7);

    // 6.3. Curr: 23-day stat line
    const stat_curr_23 = document.createElement("div");
    stat_curr_23.className   ="item-stat-23";
    stat_curr_23.textContent = item.views_23.toString() + " /   23 =" +
                               item.ratio_23.toFixed(3).padStart(7);

    // 6.4. Curr: 7-day stat line
    const stat_curr_7 = document.createElement("div");
    stat_curr_7.className   ="item-stat-7";
    stat_curr_7.textContent = item.views_7.toString() + " /    7 =" +
                              item.ratio_7.toFixed(3).padStart(7);

    // 6.5. Curr: assemble the hierarchy
    stats_curr_container.appendChild(stat_curr_old);
    stats_curr_container.appendChild(stat_curr_23 );
    stats_curr_container.appendChild(stat_curr_7  );

    // 7. Add all parts
    inner.appendChild(title);
    inner.appendChild(stats_prev_container); // Add prev stats container to inner flex
    inner.appendChild(spacer);
    inner.appendChild(stats_curr_container); // Add curr stats container to inner flex

    // 8. And wrap
    wrapper  .appendChild(inner  ); // Add inner flex to wrapper
    container.appendChild(wrapper); // Add wrapper to the page
  });
}

/* Button */

function process_filtered_range() {
  const container = document.getElementById("results");

  // Archived range
  const archived_min_str = document.getElementById("archived-min").value;
  const archived_max_str = document.getElementById("archived-max").value;

  const archived_min = new Date(archived_min_str + 'T00:00:00Z');
  const archived_max = new Date(archived_max_str + 'T23:59:59Z');

  if (isNaN(archived_min.getTime()) || isNaN(archived_max.getTime())) {
    container.innerHTML = '<div class="text-center text-comment">Please enter valid dates: YYYY-MM-DD</div>';
    return;
  }
  if (archived_min > archived_max) {
    container.innerHTML = '<div class="text-center text-comment">Start date must be before end date</div>';
    return;
  }

  // Created range
  const created_min_str = document.getElementById("created-min").value;
  const created_max_str = document.getElementById("created-max").value;

  const created_min = new Date(created_min_str + 'T00:00:00Z');
  const created_max = new Date(created_max_str + 'T23:59:59Z');

  if (isNaN(created_min.getTime()) || isNaN(created_max.getTime())) {
    container.innerHTML = '<div class="text-center text-comment">Please enter valid dates: YYYY-MM-DD</div>';
    return;
  }
  if (created_min > created_max) {
    container.innerHTML = '<div class="text-center text-comment">Start date must be before end date</div>';
    return;
  }

  // Process
  const filtered_curr_items = filter_items(stats_curr_items, archived_min, archived_max, created_min, created_max);
  const filtered_prev_items = filter_items(stats_prev_items, archived_min, archived_max, created_min, created_max);

  const results_curr = calculate_stats(filtered_curr_items, stats_curr_date);
  const results_prev = calculate_stats(filtered_prev_items, stats_prev_date);

  render_results(results_curr, results_prev);
}

/* Main */

function process_stats() {
  const container = document.getElementById("results");
        container.innerHTML = '<div class="text-center text-comment">Loading...</div>';

  const xml_url_curr = "/archive/archive-org-sergecpp-" + stats_curr_date + ".xml.txt";
  const xml_url_prev = "/archive/archive-org-sergecpp-" + stats_prev_date + ".xml.txt";

  Promise.all([
    fetch(xml_url_curr).then(response => {
      if (!response.ok) { throw new Error(stats_curr_date + " &mdash; XML file not found"); }
      return response.text();
    }),
    fetch(xml_url_prev).then(response => {
      if (!response.ok) { throw new Error(stats_prev_date + " &mdash; XML file not found"); }
      return response.text();
    })
  ])
  .then(([text_curr, text_prev]) => {
    const parser = new DOMParser();

    const xml_curr = parser.parseFromString(text_curr, "text/xml");
    if   (xml_curr.querySelector("parsererror")) { throw new Error(stats_curr_date + " &mdash; Invalid XML format"); }

    const xml_prev = parser.parseFromString(text_prev, "text/xml");
    if   (xml_prev.querySelector("parsererror")) { throw new Error(stats_prev_date + " &mdash; Invalid XML format"); }

    stats_curr_items = [...xml_curr.querySelectorAll("doc")];
    stats_prev_items = [...xml_prev.querySelectorAll("doc")];

    // Initial Filters
    const archived_min = new Date(Date.UTC(2022, 05-1, 06, 00, 00, 00)); // 2022-05-06 (UTC, months are 0-based)
    const archived_max = new Date(Date.UTC(2025, 03-1, 08, 23, 59, 59)); // 2025-03-08 (UTC, months are 0-based)

    const created_min  = new Date(Date.UTC(2012, 01-1, 01, 00, 00, 00)); // 2012-01-01 (UTC, months are 0-based)
    const created_max  = new Date(Date.UTC(2024, 10-1, 19, 23, 59, 59)); // 2024-10-19 (UTC, months are 0-based)

    // Process
    const filtered_curr_items = filter_items(stats_curr_items, archived_min, archived_max, created_min, created_max);
    const filtered_prev_items = filter_items(stats_prev_items, archived_min, archived_max, created_min, created_max);

    const results_curr        = calculate_stats(filtered_curr_items, stats_curr_date);
    const results_prev        = calculate_stats(filtered_prev_items, stats_prev_date);

    render_results(results_curr, results_prev);
  })
  .catch(err => {
    document.getElementById("results").innerHTML =
      '<div class="text-center text-comment">Error: ' + err.message + '</div>';
  });
}

// EOF






