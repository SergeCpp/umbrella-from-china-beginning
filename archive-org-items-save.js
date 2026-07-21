/* Global Variables */

const stat_curr_date  = "2025-07-23";
let   stat_curr_items = [];

const stat_prev_date  = "2025-07-21";
let   stat_prev_items = [];

/* Startup Run */

init_controls();
process_stats();

/* Items */

function filter_items(items, archived_min, archived_max, created_min, created_max) {
  const filtered_items = items.filter(doc => {
    const identifier_node = doc.querySelector("str[name='identifier']");
    const title_node      = doc.querySelector("str[name='title']"     );
    const mediatype_node  = doc.querySelector("str[name='mediatype']" );
    const date_node       = doc.querySelector("str[name='date']"      );
    const publicdate_node = doc.querySelector("str[name='publicdate']");
    const downloads_node  = doc.querySelector("str[name='downloads']" );
    const month_node      = doc.querySelector("str[name='month']"     );
    const week_node       = doc.querySelector("str[name='week']"      );

    if (!identifier_node || !title_node || !mediatype_node ||
        !publicdate_node ||
        !downloads_node  || !month_node || !week_node) {
      return false;
    }

    // Mediatype
    const mediatype     =  mediatype_node.textContent;
    const is_collection = (mediatype === "collection");
    const is_texts      = (mediatype === "texts"     );

    // Created
    let date = null;

    if (!date_node) {
      if (mediatype === "audio") { // Set default date to audio items
        date = new Date("2012-01-01T00:00:00Z"); // UTC date, earliest for entire stat
      } else {
        return false;
      }
    } else {
      date = new Date(date_node.textContent);
      if (isNaN(date.getTime())) return false;
    }

    const created_ok = (date >= created_min) && (date <= created_max);

    // Archived
    const publicdate = new Date(publicdate_node.textContent);
    if (isNaN(publicdate.getTime())) return false;
    const archived_ok = (publicdate >= archived_min) && (publicdate <= archived_max);

    // Views
    const downloads = parseInt(downloads_node.textContent, 10);
    const month     = parseInt(month_node    .textContent, 10);
    const week      = parseInt(week_node     .textContent, 10);

    if (isNaN(downloads) || isNaN(month) || isNaN(week)) return false;
    if ((downloads < month) || (month < week)) return false;

    // Check all
    return !is_collection && !is_texts && created_ok && archived_ok;
  });
  return filtered_items;
}

function calculate_stats(filtered_items, stats_date) {
  const results = filtered_items.map(doc => {
    const identifier =          doc.querySelector("str[name='identifier']").textContent;
    const title      =          doc.querySelector("str[name='title']"     ).textContent;
    const mediatype  =          doc.querySelector("str[name='mediatype']" ).textContent;
    const publicdate = new Date(doc.querySelector("str[name='publicdate']").textContent);
    const downloads  = parseInt(doc.querySelector("str[name='downloads']" ).textContent, 10);
    const month      = parseInt(doc.querySelector("str[name='month']"     ).textContent, 10);
    const week       = parseInt(doc.querySelector("str[name='week']"      ).textContent, 10);

    const calc_date  = new Date(stats_date + 'T12:00:00Z');
    const days_old   = Math.floor((calc_date - publicdate) / (24 * 60 * 60 * 1000)) - 30;
    const views_old  = downloads - month;
    const ratio_old  = parseFloat((views_old / days_old).toFixed(3));

    return {
      identifier,
      title     ,
      mediatype ,
      days_old  ,
      views_old ,
      ratio_old ,
      views_23  :              month - week,
      ratio_23  : parseFloat(((month - week) / 23).toFixed(3)),
      views_7   :                      week,
      ratio_7   : parseFloat(         (week  /  7).toFixed(3))
    };
  });
  return results;
}

/* Display */

function get_grow_ratio(curr, prev) {
  if  (!curr && !prev) { return "   "; }

  if  (!prev) {
    if (curr <= 0.05)  { return ".  "; }
    if (curr <= 0.10)  { return ".. "; }
    if (curr <= 0.15)  { return "..."; }

    if (curr <= 0.25)  { return "+  "; }
    if (curr <= 0.50)  { return "++ "; }
                         return "+++";
  }

  if  (!curr) {
    if (prev <= 0.05)  { return ".  "; }
    if (prev <= 0.10)  { return ".. "; }
    if (prev <= 0.15)  { return "..."; }

    if (prev <= 0.25)  { return "-  "; }
    if (prev <= 0.50)  { return "-- "; }
                         return "---";
  }

  const ratio = curr / prev;

  if   (ratio === 1)   { return "   "; }

  if  ((ratio >= 0.99) && (ratio <= 1.01)) { return ".  "; }
  if  ((ratio >= 0.98) && (ratio <= 1.02)) { return ".. "; }
  if  ((ratio >= 0.97) && (ratio <= 1.03)) { return "..."; }

  if   (ratio >  1) {
    if (ratio <= 1.05) { return "+  "; }
    if (ratio <= 1.07) { return "++ "; }
                         return "+++";
  }
  //    ratio <  1
  if   (ratio >= 0.95) { return "-  "; }
  if   (ratio >= 0.93) { return "-- "; }
                         return "---";
}

function get_grow_fixed(curr, prev) {
  const diff = curr - prev;
  if   (diff     === 0) { return "   "; }

  const diff_abs = Math.abs(diff);
  if   (diff_abs === 1) { return ".  "; }
  if   (diff_abs === 2) { return ".. "; }
  if   (diff_abs === 3) { return "..."; }

  if   (diff     >   0) {
    if (diff_abs <=  5) { return "+  "; }
    if (diff_abs <=  7) { return "++ "; }
                          return "+++";
  }
  //    diff     <   0
  if   (diff_abs <=  5) { return "-  "; }
  if   (diff_abs <=  7) { return "-- "; }
                          return "---";
}

function render_stats(results, date, container) {
  // Sorting results
  results.sort((a, b) => { // Descending for views
    if (a.ratio_old !== b.ratio_old) { return b.ratio_old - a.ratio_old; }
    if (a.ratio_23  !== b.ratio_23 ) { return b.ratio_23  - a.ratio_23;  }
    if (a.ratio_7   !== b.ratio_7  ) { return b.ratio_7   - a.ratio_7;   }
    return a.title.localeCompare(b.title); // Ascending for titles: A >> Z
  });

  // Show stats: min, 10%, 25%, 50%, 75%, 90%, max
  const stats_text = document.createElement("div");
  stats_text.className = "text-center";
  stats_text.style.color = "#696969"; // DimGray, L41
//stats_text.style.fontFamily = "monospace";
  stats_text.style.fontSize = "0.8em";

  // Calculate stats from sorted results
  const max = results[0                 ]?.ratio_old || 0;
  const min = results[results.length - 1]?.ratio_old || 0;

  // Simple percentile approximations (array is already sorted)
  const get_percentile = (percent) => {
    const index = Math.floor((100 - percent) / 100 * results.length);
    return results[index]?.ratio_old || 0;
  };

  const percentile10 = get_percentile(10);
  const quartile1    = get_percentile(25);
  const median       = get_percentile(50);
  const quartile3    = get_percentile(75);
  const percentile90 = get_percentile(90);

  stats_text.textContent =
             date                    + ' : ' +
    'Min ' + min         .toFixed(3) + ' / ' +
    '10% ' + percentile10.toFixed(3) + ' / ' +
    '25% ' + quartile1   .toFixed(3) + ' / ' +
    '50% ' + median      .toFixed(3) + ' / ' +
    '75% ' + quartile3   .toFixed(3) + ' / ' +
    '90% ' + percentile90.toFixed(3) + ' / ' +
    'Max ' + max         .toFixed(3);

  container.appendChild(stats_text);
}

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

  // Build a map of prev results by identifier
  const map_prev = {};
  results_prev.forEach(item => {
    map_prev[item.identifier] = item;
  });

  // Check for complete linking
  const new_curr_items = results_curr.filter(item => 
    !map_prev.hasOwnProperty(item.identifier)
  );

  if (new_curr_items.length > 0) {
    container.innerHTML = '<div class="text-center text-comment">' +
      new_curr_items.length + ' new item' + (new_curr_items.length === 1 ? "" : 's') +
      ' appeared in current stat</div>';
    return;
  }

  // Mediatype counts displaying
  const mediatype_counts = { movies: 0, audio: 0 };
  results_curr.forEach(item => {
    if (item.mediatype === "movies") mediatype_counts.movies++;
    if (item.mediatype === "audio" ) mediatype_counts.audio++;
  });

  const total = mediatype_counts.movies + mediatype_counts.audio;
  const count_div = document.createElement("div");
  count_div.className = "subtitle text-center text-normal";
  count_div.textContent = 'Total ' + total + ' ' +
                         '(Audio ' + mediatype_counts.audio  + ' / ' +
                          'Video ' + mediatype_counts.movies + ')';
  container.appendChild(count_div);

  render_stats(results_prev, stat_prev_date, container); // also sorts results_prev
  render_stats(results_curr, stat_curr_date, container); // also sorts results_curr

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
    title.className = "item-title";

    const link = document.createElement("a");
    link.textContent = (index + 1) + ". " + item.title;
    link.href = "https://archive.org/details/" + item.identifier;
    link.target = "_blank";
    link.rel = "noopener"; // Safe for _blank
    title.appendChild(link);

    // 4.0. Get matching prev item
    const item_prev = map_prev[item.identifier];

    // 4.1. Prev stat container (stacked)
    const stat_prev_container = document.createElement("div");
    stat_prev_container.className = "item-stat-container";

    // 4.2. Prev: old stat line
    const stat_prev_old = document.createElement("div");
    stat_prev_old.className   ="item-stat-old";
    stat_prev_old.textContent = item_prev.views_old.toString().padStart(6) + " /" +
                                item_prev.days_old .toString().padStart(5) + " =" +
                                item_prev.ratio_old.toFixed(3).padStart(7);

    // 4.3. Prev: 23-day stat line
    const stat_prev_23 = document.createElement("div");
    stat_prev_23.className   ="item-stat-23";
    stat_prev_23.textContent = item_prev.views_23.toString().padStart(6) + " /   23 =" +
                               item_prev.ratio_23.toFixed(3).padStart(7);

    // 4.4. Prev: 7-day stat line
    const stat_prev_7 = document.createElement("div");
    stat_prev_7.className   ="item-stat-7";
    stat_prev_7.textContent = item_prev.views_7.toString().padStart(6) + " /    7 =" +
                              item_prev.ratio_7.toFixed(3).padStart(7);

    // 4.5. Prev: assemble the hierarchy
    stat_prev_container.appendChild(stat_prev_old);
    stat_prev_container.appendChild(stat_prev_23 );
    stat_prev_container.appendChild(stat_prev_7  );

    // 5. Spacer between prev and curr
    const spacer = document.createElement("div");
    spacer.className = "item-spacer";

    // 6.1. Curr stat container (stacked)
    const stat_curr_container = document.createElement("div");
    stat_curr_container.className = "item-stat-container";

    // 6.2. Curr: old stat line
    const stat_curr_old = document.createElement("div");
    stat_curr_old.className   ="item-stat-old";
    stat_curr_old.textContent = item.views_old.toString().padStart(6) + " /" +
                                item.days_old .toString().padStart(5) + " =" +
                                item.ratio_old.toFixed(3).padStart(7);

    // 6.3. Curr: 23-day stat line
    const stat_curr_23 = document.createElement("div");
    stat_curr_23.className   ="item-stat-23";
    stat_curr_23.textContent = item.views_23.toString().padStart(6) + " /   23 =" +
                               item.ratio_23.toFixed(3).padStart(7);

    // 6.4. Curr: 7-day stat line
    const stat_curr_7 = document.createElement("div");
    stat_curr_7.className   ="item-stat-7";
    stat_curr_7.textContent = item.views_7.toString().padStart(6) + " /    7 =" +
                              item.ratio_7.toFixed(3).padStart(7);

    // 6.5. Curr: assemble the hierarchy
    stat_curr_container.appendChild(stat_curr_old);
    stat_curr_container.appendChild(stat_curr_23 );
    stat_curr_container.appendChild(stat_curr_7  );

    // 7.1. Grow container (stacked)
    const stat_grow_container = document.createElement("div");
    stat_grow_container.className = "item-grow-container";

    // 7.2. Grow: old
    const stat_grow_old = document.createElement("div");
    stat_grow_old.className ="item-grow-old";

    const grow_old = get_grow_ratio(item.ratio_old, item_prev.ratio_old);
    stat_grow_old.textContent = grow_old;

    // 7.3. Grow: 23
    const stat_grow_23 = document.createElement("div");
    stat_grow_23.className ="item-grow-23";

    const grow_23 = get_grow_fixed(item.views_23, item_prev.views_23);
    stat_grow_23.textContent = grow_23;

    // 7.4. Grow: 7
    const stat_grow_7 = document.createElement("div");
    stat_grow_7.className ="item-grow-7";

    const grow_7 = get_grow_fixed(item.views_7, item_prev.views_7);
    stat_grow_7.textContent = grow_7;

    // 7.5. Grow: assemble the hierarchy
    stat_grow_container.appendChild(stat_grow_old);
    stat_grow_container.appendChild(stat_grow_23 );
    stat_grow_container.appendChild(stat_grow_7  );

    // 8. Add all parts
    inner.appendChild(title);
    inner.appendChild(stat_prev_container);
    inner.appendChild(spacer);
    inner.appendChild(stat_curr_container);
    inner.appendChild(stat_grow_container);

    // 9. And wrap
    wrapper  .appendChild(inner  ); // Add inner flex to wrapper
    container.appendChild(wrapper); // Add wrapper to the page
  });
}

/* Controls */

function init_controls() {
  // 1. Add Enter key to all date inputs
  ["archived-min", "archived-max", "created-min", "created-max"].forEach(id => {
    const input = document.getElementById(id);
    if   (input) {
      input.onkeyup = function(event) {
        if (event.key === "Enter") {
          process_filtered_range();
        }
      };
    }
  });

  // 2. Add click to button
  const button = document.getElementById("process-button");
  if   (button) {
    button.onclick = process_filtered_range;
  }
}

function is_date_valid(year, month, day) {
  // Create date and check if it "corrects" the input
  const  date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && 
         date.getUTCMonth() === (month - 1) && 
         date.getUTCDate() === day;
}

function get_date_range(date_str) {
  if (!date_str) return null;

  // Catch empty parts like "2022-", "2022--", "2022-08-", "2022--08"
  const parts_str = date_str.trim().split('-');
  if   (parts_str.some(part => (part === ""))) return null;

  // Now convert to numbers
  const parts = parts_str.map(Number);
  if   (parts.some(isNaN)) return null;

  // And process them
  if (parts.length === 1) { // Year
    const year = parts[0];
    return {
      min: new Date(Date.UTC(year, 01-1, 01, 00, 00, 00)), // Year beg day
      max: new Date(Date.UTC(year, 12-1, 31, 23, 59, 59))  // Year end day
    }
  }
  if (parts.length === 2) { // Year-Month
    const [year, month] = parts;
    if (!is_date_valid(year, month, 1)) return null;
    const e_mday = new Date(year, month,  0).getDate();
    return {
      min: new Date(Date.UTC(year, month - 1, 1,      00, 00, 00)), // Month beg day
      max: new Date(Date.UTC(year, month - 1, e_mday, 23, 59, 59))  // Month end day
    }
  }
  if (parts.length === 3) { // Year-Month-Day
    const [year, month, day] = parts;
    if (!is_date_valid(year, month, day)) return null;
    return {
      min: new Date(Date.UTC(year, month - 1, day, 00, 00, 00)), // Day beg
      max: new Date(Date.UTC(year, month - 1, day, 23, 59, 59))  // Day end
    }
  }
  return null; // Invalid format
}

function process_filtered_range() {
  const container = document.getElementById("results");
  const err_valid = '<div class="text-center text-comment">Valid dates are: YYYY / YYYY-MM / YYYY-MM-DD</div>';
  const err_range = '<div class="text-center text-comment">Start date must be before end date</div>';

  // Archived range
  const archived_min_str = document.getElementById("archived-min").value.trim();
  const archived_max_str = document.getElementById("archived-max").value.trim();

  const archived_min_range = get_date_range(archived_min_str);
  const archived_max_range = get_date_range(archived_max_str);

  if (!archived_min_range || !archived_max_range) {
    container.innerHTML = err_valid;
    return;
  }

  const archived_min = archived_min_range.min;
  const archived_max = archived_max_range.max;

  if (archived_min > archived_max) {
    container.innerHTML = err_range;
    return;
  }

  // Created range
  const created_min_str = document.getElementById("created-min").value.trim();
  const created_max_str = document.getElementById("created-max").value.trim();

  const created_min_range = get_date_range(created_min_str);
  const created_max_range = get_date_range(created_max_str);

  if (!created_min_range || !created_max_range) {
    container.innerHTML = err_valid;
    return;
  }

  const created_min = created_min_range.min;
  const created_max = created_max_range.max;

  if (created_min > created_max) {
    container.innerHTML = err_range;
    return;
  }

  // Process
  const filtered_curr_items = filter_items(stat_curr_items, archived_min, archived_max, created_min, created_max);
  const filtered_prev_items = filter_items(stat_prev_items, archived_min, archived_max, created_min, created_max);

  const results_curr = calculate_stats(filtered_curr_items, stat_curr_date);
  const results_prev = calculate_stats(filtered_prev_items, stat_prev_date);

  render_results(results_curr, results_prev);
}

/* Main */

function process_stats() {
  const container = document.getElementById("results");
        container.innerHTML = '<div class="text-center text-comment">Loading...</div>';

  const xml_url_curr = "/archive/archive-org-sergecpp-" + stat_curr_date + ".xml.txt";
  const xml_url_prev = "/archive/archive-org-sergecpp-" + stat_prev_date + ".xml.txt";

  Promise.all([
    fetch(xml_url_curr).then(response => {
      if (!response.ok) { throw new Error(stat_curr_date + " &mdash; XML file not found"); }
      return response.text();
    }),
    fetch(xml_url_prev).then(response => {
      if (!response.ok) { throw new Error(stat_prev_date + " &mdash; XML file not found"); }
      return response.text();
    })
  ])
  .then(([text_curr, text_prev]) => {
    const parser = new DOMParser();

    const xml_curr = parser.parseFromString(text_curr, "text/xml");
    if   (xml_curr.querySelector("parsererror")) { throw new Error(stat_curr_date + " &mdash; Invalid XML format"); }

    const xml_prev = parser.parseFromString(text_prev, "text/xml");
    if   (xml_prev.querySelector("parsererror")) { throw new Error(stat_prev_date + " &mdash; Invalid XML format"); }

    stat_curr_items = [...xml_curr.querySelectorAll("doc")];
    stat_prev_items = [...xml_prev.querySelectorAll("doc")];

    // Initial Filters
    const archived_min = new Date(Date.UTC(2022, 05-1, 06, 00, 00, 00)); // 2022-05-06 (UTC, months are 0-based)
    const archived_max = new Date(Date.UTC(2025, 03-1, 08, 23, 59, 59)); // 2025-03-08 (UTC, months are 0-based)

    const created_min  = new Date(Date.UTC(2012, 01-1, 01, 00, 00, 00)); // 2012-01-01 (UTC, months are 0-based)
    const created_max  = new Date(Date.UTC(2024, 10-1, 19, 23, 59, 59)); // 2024-10-19 (UTC, months are 0-based)

    // Process
    const filtered_curr_items = filter_items(stat_curr_items, archived_min, archived_max, created_min, created_max);
    const filtered_prev_items = filter_items(stat_prev_items, archived_min, archived_max, created_min, created_max);

    const results_curr        = calculate_stats(filtered_curr_items, stat_curr_date);
    const results_prev        = calculate_stats(filtered_prev_items, stat_prev_date);

    render_results(results_curr, results_prev);
  })
  .catch(err => {
    document.getElementById("results").innerHTML =
      '<div class="text-center text-comment">Error: ' + err.message + '</div>';
  });
}

// EOF






