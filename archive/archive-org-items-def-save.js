/* Global Variables */

const stat_file_dates = [];   // ["YYYY-MM-DD"]

let   stat_curr_date  = null; //  "YYYY-MM-DD"
let   stat_curr_items = [];

let   stat_prev_date  = null; //  "YYYY-MM-DD"
let   stat_prev_items = [];

let   du_load         = 0;    // Duration of load
let   du_parse        = 0;    // Duration of parse

/* Items */

function evaluate_term(term, values, matcher) {
  switch(term.type) {
    case "AND":
      return term.terms.every(part => 
        evaluate_term(part, values, matcher));

    case "OR":
      return term.terms.some(part => 
        evaluate_term(part, values, matcher));

    case "NOT":
    case "NOTANY":
      //  NOTANY: Exclude if any value matches term.excl
      const any_match = evaluate_term(term.excl, values, matcher);
      return (!term.incl || evaluate_term(term.incl, values, matcher)) && !any_match;

    case "NOTALL":
      //  NOTALL: Exclude if all values matches term.excl
      const all_match = values.every(value => {
        return evaluate_term(term.excl, [value], matcher);
      });
      return (!term.incl || evaluate_term(term.incl, values, matcher)) && !all_match;

    case "TEXT":
      return values.some(value => matcher(value, term.text));

    default:
      return false; // Unknown type
  }
}

function filter_matches(doc, field, terms, matcher) {
  if (!terms)              return true; // No    filter = match all
  if  (terms.length === 0) return true; // Empty filter = match all

  // Get all values for this field (handles both <arr> and <str>)
  const node = doc.querySelector('arr[name="' + field + '"], str[name="' + field + '"]');
  let values = [];

  if (node) {
    if (node.tagName.toLowerCase() === "arr") {
      values = Array.from(node.querySelectorAll("str")).map(n => n.textContent);
    } else {
      values = [node.textContent];
    }
  }

  // Check if any term matches
  return terms.some(term => {
    return evaluate_term(term, values, matcher);
  });
}

function filter_items(items, archived_min, archived_max, created_min, created_max, collections, creators) {
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
    const mediatype =  mediatype_node.textContent;
    const is_movies = (mediatype === "movies");
    const is_audio  = (mediatype === "audio" );

    // Created
    let date = null;

    if (!date_node) {
      if (is_audio) { // Set default date to audio items
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

    // Collections
    const matches_collections = filter_matches(
      doc,
     "collection",
      collections,
      (value, term) => value.toLowerCase().includes(term.toLowerCase())
    );

    // Creators
    const matches_creators = filter_matches(
      doc,
     "creator",
      creators,
      (value, term) => value.toLowerCase().includes(term.toLowerCase())
    );

    // Check all together
    return (is_movies || is_audio) && created_ok && archived_ok && matches_collections && matches_creators;
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

    const calc_date  = new Date(stats_date + "T11:59:59.999Z");
    const days_old   = Math.round((calc_date - publicdate) / (24 * 60 * 60 * 1000)) - 30;
    const views_old  = downloads - month;
    const ratio_old  = parseFloat((views_old / days_old).toFixed(3));

    // Get collections and count favorites
    const collection_node = doc.querySelector("arr[name='collection']");
    let   favorites       = 0;
    
    if (collection_node) {
      if (collection_node.tagName.toLowerCase() === "arr") {
        // Handle array of collections
        const collections = Array.from(collection_node.querySelectorAll("str")).map(n => n.textContent);
        favorites = collections.filter(c => c.toLowerCase().startsWith("fav-")).length;
      } else {
        // Handle single collection
        const collection = collection_node.textContent;
        favorites = collection.toLowerCase().startsWith("fav-") ? 1 : 0;
      }
    }

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
      ratio_7   : parseFloat(         (week  /  7).toFixed(3)),
      favorites
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

function get_total_counts(results) {
  const total_counts = { movies: 0, audio: 0, favorited: 0, favorites: 0 };
  results.forEach(item => {
    if (item.mediatype === "movies") total_counts.movies++;
    if (item.mediatype === "audio" ) total_counts.audio++;

    total_counts.favorited += item.favorites != 0;
    total_counts.favorites += item.favorites;
  });
  return total_counts;
}

function sort_results(results) {
  results.sort((a, b) => { // Descending for views
    if (a.ratio_old !== b.ratio_old) { return b.ratio_old - a.ratio_old; }
    if (a.ratio_23  !== b.ratio_23 ) { return b.ratio_23  - a.ratio_23;  }
    if (a.ratio_7   !== b.ratio_7  ) { return b.ratio_7   - a.ratio_7;   }
    return a.title.localeCompare(b.title); // Ascending for titles: A >> Z
  });
}

function render_stats(results, date, what, container) {
  sort_results(results);

  // Show stats: Min, 10%, 25%, 50%, 75%, 90%, Max
  const stats_text = document.createElement("div");
  stats_text.className = "text-center";
  stats_text.style.color = "#696969"; // DimGray, L41

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

  stats_text.innerHTML =
    '<span ' +
       'role="button" style="cursor:pointer;" tabindex="0" ' +
       'onkeydown="if (event.key === \'Enter\' || event.key === \' \') { event.preventDefault(); }" ' +
       'onkeyup  ="if (event.key === \'Enter\' || event.key === \' \') { ' +
                  'date_change_menu(event, \'' + what + '\'); }" ' +
       'onclick  ="date_change_menu(event, \'' + what + '\')" ' +
       '>' + date + '</span>'        + ' : ' +
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

  if ((results_curr.length === 0) && (results_prev.length === 0)) {
    container.innerHTML =
      '<div class="text-center text-comment">No items matched the filters</div>';
    return false;
  }

  // Lookup helper
  const results_curr_ids = {};
  results_curr.forEach(item => {
    results_curr_ids[item.identifier] = true;
  });

  // Create expanded results array
  const results_curr_exp = results_curr.map(item => ({ ...item, is_exp: false }));

  // Add items from results_prev that aren't in results_curr
  results_prev.forEach(item => {
    if (!results_curr_ids[item.identifier]) {
      results_curr_exp.push({ ...item, is_exp: true });
    }
  });

  // Build a map of prev results by identifier
  const map_prev = {};
  results_prev.forEach(item => {
    map_prev[item.identifier] = item;
  });

  // Total counts displaying (for expanded results)
  const curr_exp_counts  = get_total_counts(results_curr_exp);
  const curr_exp_total   = curr_exp_counts.movies + curr_exp_counts.audio;
  const counts_div       = document.createElement("div");
  counts_div.className   = "subtitle text-center text-normal";
  counts_div.textContent = 'Total ' + curr_exp_total            +   ' ' +
                          '(Audio ' + curr_exp_counts.audio     + ' / ' +
                           'Video ' + curr_exp_counts.movies    +  ') ' +
                           'Fav '   + curr_exp_counts.favorited + ' / ' +
                                      curr_exp_counts.favorites;
  container.appendChild(counts_div);

  // Both stats displaying
  render_stats(results_prev, stat_prev_date, "prev", container); // Also sorts results_prev
  render_stats(results_curr, stat_curr_date, "curr", container); // Also sorts results_curr

  container.lastElementChild.style.marginBottom = "1em"; // Add space before item list

  sort_results(results_curr_exp);

  // Show item list with flex alignment
  results_curr_exp.forEach((item, index) => {
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
    stat_prev_old.textContent = item_prev
                              ? item_prev.views_old.toString().padStart( 6) + " /" +
                                item_prev.days_old .toString().padStart( 5) + " =" +
                                item_prev.ratio_old.toFixed(3).padStart( 7)
                              :                             "".padStart(22);

    // 4.3. Prev: 23-day stat line
    const stat_prev_23 = document.createElement("div");
    stat_prev_23.className   ="item-stat-23";
    stat_prev_23.textContent = item_prev
                             ? item_prev.views_23.toString().padStart( 6) + " /   23 =" +
                               item_prev.ratio_23.toFixed(3).padStart( 7)
                             :                            "".padStart(22);

    // 4.4. Prev: 7-day stat line
    const stat_prev_7 = document.createElement("div");
    stat_prev_7.className   ="item-stat-7";
    stat_prev_7.textContent = item_prev
                            ? item_prev.views_7.toString().padStart( 6) + " /    7 =" +
                              item_prev.ratio_7.toFixed(3).padStart( 7)
                            :                           "".padStart(22);

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
    stat_curr_old.textContent = item.is_exp
                              ?                        "".padStart(22)
                              : item.views_old.toString().padStart( 6) + " /" +
                                item.days_old .toString().padStart( 5) + " =" +
                                item.ratio_old.toFixed(3).padStart( 7);

    // 6.3. Curr: 23-day stat line
    const stat_curr_23 = document.createElement("div");
    stat_curr_23.className   ="item-stat-23";
    stat_curr_23.textContent = item.is_exp
                             ?                       "".padStart(22)
                             : item.views_23.toString().padStart( 6) + " /   23 =" +
                               item.ratio_23.toFixed(3).padStart( 7);

    // 6.4. Curr: 7-day stat line
    const stat_curr_7 = document.createElement("div");
    stat_curr_7.className   ="item-stat-7";
    stat_curr_7.textContent = item.is_exp
                            ?                      "".padStart(22)
                            : item.views_7.toString().padStart( 6) + " /    7 =" +
                              item.ratio_7.toFixed(3).padStart( 7);

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

    const grow_old = item_prev ? get_grow_ratio(item.ratio_old, item_prev.ratio_old) : "   ";
    stat_grow_old.textContent = grow_old;

    // 7.3. Grow: 23
    const stat_grow_23 = document.createElement("div");
    stat_grow_23.className ="item-grow-23";

    const grow_23 = item_prev ? get_grow_fixed(item.views_23, item_prev.views_23) : "   ";
    stat_grow_23.textContent = grow_23;

    // 7.4. Grow: 7
    const stat_grow_7 = document.createElement("div");
    stat_grow_7.className ="item-grow-7";

    const grow_7 = item_prev ? get_grow_fixed(item.views_7, item_prev.views_7) : "   ";
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
  return true;
}

/* Controls */

function init_controls() {
  // 1. Add Enter key to all date inputs
  ["archived-min", "archived-max", "created-min", "created-max", "collections", "creators"]
  .forEach(id => {
    const input = document.getElementById(id);
    if   (input) {
      input.onkeyup = function(event) {
        if (event.key === "Enter") {
          process_filter();
        }
      };
    }
  });

  // 2. Add click to button
  const button = document.getElementById("process-filter");
  if   (button) {
    button.onclick = process_filter;
  }
}

/* Filter */

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
      min: new Date(Date.UTC(year, 01-1, 01, 00, 00, 00, 000)), // Year beg day
      max: new Date(Date.UTC(year, 12-1, 31, 23, 59, 59, 999))  // Year end day
    }
  }
  if (parts.length === 2) { // Year-Month
    const [year, month] = parts;
    if (!is_date_valid(year, month, 1)) return null;
    const e_mday = new Date(year, month, 0).getDate();
    return {
      min: new Date(Date.UTC(year, month - 1, 1,      00, 00, 00, 000)), // Month beg day
      max: new Date(Date.UTC(year, month - 1, e_mday, 23, 59, 59, 999))  // Month end day
    }
  }
  if (parts.length === 3) { // Year-Month-Day
    const [year, month, day] = parts;
    if (!is_date_valid(year, month, day)) return null;
    return {
      min: new Date(Date.UTC(year, month - 1, day, 00, 00, 00, 000)), // Day beg
      max: new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))  // Day end
    }
  }
  return null; // Invalid format
}

function parse_term(term) {
  term = term.trim();

  // Check for AND first (higher precedence)
  if (term.includes(" AND ")) {
    const terms = term.split(" AND ").map(part => parse_term(part));
    return {
      type: "AND",
      terms: terms
    };
  }
  // Check for NOT next
  else if (term.includes("NOT ")) {
    const index = term.indexOf("NOT ");
    const incl  = term.substring(0, index    ); // Left
    const excl  = term.substring(   index + 4); // Right
    return {
      type: "NOT",
      incl: incl ? parse_term(incl) : null,
      excl:        parse_term(excl)
    };
  }
  // Check for NOTANY next
  else if (term.includes("NOTANY ")) {
    const index = term.indexOf("NOTANY ");
    const incl  = term.substring(0, index    ); // Left
    const excl  = term.substring(   index + 7); // Right
    return {
      type: "NOTANY",
      incl: incl ? parse_term(incl) : null,
      excl:        parse_term(excl)
    };
  }
  // Check for NOTALL next
  else if (term.includes("NOTALL ")) {
    const index = term.indexOf("NOTALL ");
    const incl  = term.substring(0, index    ); // Left
    const excl  = term.substring(   index + 7); // Right
    return {
      type: "NOTALL",
      incl: incl ? parse_term(incl) : null,
      excl:        parse_term(excl)
    };
  }
  // Check for OR next
  else if (term.includes(" OR ")) {
    const terms = term.split(" OR ").map(part => parse_term(part));
    return {
      type: "OR",
      terms: terms
    };
  }
  // Plain text term (OR behavior of comma-separated terms)
  else {
    return {
      type: "TEXT",
      text: term.replace(/['"]/g, "") // Quote allows leading/trailing space, also ' ' possible for term
    };
  }
}

function input_clean_parse(input) {
  return input
    .replace(/  +/g, ' ')
    .split  (',')
    .map    (term => term.trim())
    .filter (term => term) // Non-empty only
    .map    (parse_term);
}

function input_allowed_chars(input) {
  return !/[^a-zA-Z0-9._\-'" ,]/.test(input);
}

function process_filter() {
  const time_0    = performance.now();
  const container = document.getElementById("results");
  const timings   = document.getElementById("timings");
        timings.textContent = "";

  const err_dates = '<div class="text-center text-comment">' +
    'Valid dates are: YYYY / YYYY-MM / YYYY-MM-DD</div>';
  const err_range = '<div class="text-center text-comment">' +
    'Start date must be before end date</div>';
  const err_chars = '<div class="text-center text-comment">' +
    'Allowed characters are: a-z, 0-9, underscore, dash, period, comma, quote, and space</div>';

  // Archived range
  const archived_min_str = document.getElementById("archived-min").value.trim();
  const archived_max_str = document.getElementById("archived-max").value.trim();

  const archived_min_range = get_date_range(archived_min_str);
  const archived_max_range = get_date_range(archived_max_str);

  if (!archived_min_range || !archived_max_range) {
    container.innerHTML = err_dates;
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
    container.innerHTML = err_dates;
    return;
  }

  const created_min = created_min_range.min;
  const created_max = created_max_range.max;

  if (created_min > created_max) {
    container.innerHTML = err_range;
    return;
  }

  // Collections and Creators
  const collections_str = document.getElementById("collections").value;
  const creators_str    = document.getElementById("creators"   ).value;

  if (!input_allowed_chars(collections_str) || !input_allowed_chars(creators_str)) {
    container.innerHTML = err_chars;
    return;
  }

  const collections = input_clean_parse(collections_str);
  const creators    = input_clean_parse(creators_str   );

  // Process
  const filtered_curr_items = filter_items(
    stat_curr_items, archived_min, archived_max, created_min, created_max, collections, creators);
  const filtered_prev_items = filter_items(
    stat_prev_items, archived_min, archived_max, created_min, created_max, collections, creators);

  const time_1       = performance.now();
  const results_curr = calculate_stats(filtered_curr_items, stat_curr_date);
  const results_prev = calculate_stats(filtered_prev_items, stat_prev_date);
  const time_2       = performance.now();

  if (!render_results(results_curr, results_prev)) {
    return;
  }

  // Timings
  const time_3        = performance.now();
  timings.textContent = 'Load '   + du_load          .toFixed(1) + ' ms / ' +
                        'Parse '  + du_parse         .toFixed(1) + ' ms / ' +
                        'Filter ' + (time_1 - time_0).toFixed(1) + ' ms / ' +
                        'Calc '   + (time_2 - time_1).toFixed(1) + ' ms / ' +
                        'Render ' + (time_3 - time_2).toFixed(1) + ' ms';
}

/* Date Change */

function date_change_menu(event, what) {
  const menu_old = document.getElementById('date-change-menu');
  if   (menu_old) { menu_old.remove_ex(); }

  const i_date = stat_file_dates.indexOf(what === "curr" ? stat_curr_date : stat_prev_date);
  const i_min  = 0;
  const i_max  = stat_file_dates.length - 1;
  const h_view = 3;
  let   i_beg  = i_date - h_view;
  let   i_end  = i_date + h_view;

  if (i_beg < i_min) {
      i_end = Math.min(i_end + (i_min - i_beg), i_max);
      i_beg = i_min; }

  if (i_end > i_max) {
      i_beg = Math.max(i_beg - (i_end - i_max), i_min);
      i_end = i_max; }

  const d_count  = i_end - i_beg + 1;
  const rect     = event.target.getBoundingClientRect();
  let   menu_top = rect.top    + window.scrollY - (45 + 28 * d_count);
  if   (menu_top <               window.scrollY)     {
        menu_top = rect.bottom + window.scrollY + 2; }

  const menu_caller = document.activeElement;
  const menu        = document.createElement('div');
  menu.id                    = 'date-change-menu';
  menu.style.position        = 'absolute';
  menu.style.left            = (rect.left + window.scrollX) + 'px';
  menu.style.top             =  menu_top                    + 'px';
  menu.style.zIndex          = '1000';
  menu.style.backgroundColor = '#fafafa'; // Gray98
  menu.style.border          = '2px solid #ebebeb'; // Gray92
  menu.style.borderRadius    = '4px';
  menu.style.padding         = '4px';
  menu.style.boxShadow       = '2px 2px 4px rgba(0,0,0,0.2)';
  menu.setAttribute            ('role', 'menu');

  menu.remove_ex = function() {
    document.removeEventListener('click', menu.outside_click);
    menu.remove();

    if (menu_caller && document.body.contains(menu_caller)) { menu_caller.focus(); }
  }

  menu.outside_click = (e) => {
    if (!menu.contains(e.target)) { menu.remove_ex(); }
  }

  // Defer adding until all currently pending event handlers (menu creation click) have finished
  setTimeout(() => {
    if (menu && document.body.contains(menu)) { document.addEventListener('click', menu.outside_click); }
  }, 0);

  menu.onkeydown = (e) => {
    if (e.key === 'Escape') { menu.remove_ex(); }
  };

  const init_opt = (opt, color, text) => {
    opt.style.borderRadius = '4px';
    opt.style.padding      = '2px 4px';
    opt.style.cursor       = 'pointer';
    opt.style.textAlign    = 'center';
    opt.style.color        = color;
    opt.textContent        = text;
    opt.tabIndex           = 0;
    opt.setAttribute         ('role', 'menuitem');
    opt.onmouseover        = () => { opt.style.backgroundColor = '#ebebeb'; }; // Gray92
    opt.onmouseout         = () => { opt.style.backgroundColor = ""; };

    opt.onkeydown = (e) => {
      const k = e.key;
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
      } else {
        if(!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) return;
        e.preventDefault();

        const menu = e.currentTarget.parentElement;
        const opts = Array.from(menu.children);
        const curr = opts.indexOf(e.currentTarget);
        let   next;

        if ((k === 'ArrowUp') || (k === 'ArrowLeft') || (k === 'Tab' && e.shiftKey)) {
          next = (curr - 1 + opts.length) % opts.length;
        } else { // ArrowDown or ArrowRight or Tab
          next = (curr + 1)               % opts.length;
        }
        opts[next].focus();
      }
    };

    opt.onkeyup = (e) => {
      const k = e.key;
      if (k === 'Enter' || k === ' ') {
        opt.click();
      }
    };
  };

  for(let i = i_beg; i <= i_end; i++) {
    const date     = stat_file_dates[i];
    const date_opt = document.createElement('div');
    init_opt(date_opt, '#696969', date); // DimGray, L41

    date_opt.onclick = function() {
      menu.remove_ex();
      reload_stat(date, what);
    };
    menu.appendChild(date_opt);
  }

  const close_opt = document.createElement('div');
  init_opt(close_opt, '#9e9e9e', 'Close'); // Gray62

  close_opt.onclick = function() {
    menu.remove_ex();
  };
  menu.appendChild(close_opt);

  document.body.appendChild(menu);
  menu.children[i_date - i_beg].focus();
}

/* Dates */

function init_dates() {
  const container = document.getElementById("results");
  const dates_url = container.getAttribute("data-dates");

  return fetch(dates_url)
    .then(response => {
      if (!response.ok) { throw new Error("Dates file not found"); }
      return response.text();
    })
    .then(text => {
      const dates_lines     = text.trim().split("\n");
      const dates_lines_cnt = dates_lines.length;

      for(let line_num = 0; line_num < dates_lines_cnt; line_num++) {
        stat_file_dates[line_num] = dates_lines[line_num].trim();
      }
      stat_file_dates.sort();

      stat_curr_date = stat_file_dates[stat_file_dates.length - 1];
      stat_prev_date = stat_file_dates[stat_file_dates.length - 2];
    })
    .catch(err => {
      document.getElementById("results").innerHTML =
        '<div class="text-center text-comment">Error: ' + err.message + '</div>';
      throw err;
    });
}

/* Main */

function load_stat_file(date) {
  const time_0    = performance.now();
  const container = document.getElementById("results");
  const xml_tmplt = container.getAttribute("data-stats");
  const xml_regex = /#/;
  const xml_url   = xml_tmplt.replace(xml_regex, date);

  return fetch(xml_url)
    .then(response => {
      if (!response.ok) { throw new Error(date + " &mdash; XML file not found"); }
      return response.text();
    })
    .then(text => {
      const time_1 = performance.now();
      const parser = new DOMParser();
      const xml    = parser.parseFromString(text, "text/xml");
      const time_2 = performance.now();

      du_load  += (time_1 - time_0);
      du_parse += (time_2 - time_1);

      if (xml.querySelector("parsererror")) { throw new Error(date + " &mdash; Invalid XML format"); }
      return [...xml.querySelectorAll("doc")];
    });
}

function reload_stat(date, what) {
  if (!stat_file_dates.includes(date)) return;

  if (what === "curr") {
    if (stat_curr_date === date) return;
  } else { //  "prev"
    if (stat_prev_date === date) return;
  }

  // Reset
  du_load  = 0;
  du_parse = 0;

  load_stat_file(date)
    .then(loaded_items => {
      if (what === "curr") {
        stat_curr_items = loaded_items;
        stat_curr_date  = date;
      } else { //  "prev"
        stat_prev_items = loaded_items;
        stat_prev_date  = date;
      }
      process_filter();
    })
    .catch(err => {
      document.getElementById("results").innerHTML =
        '<div class="text-center text-comment">Error: ' + err.message + '</div>';
    });
}

function process_stats() {
  const container = document.getElementById("results");
        container.innerHTML = '<div class="text-center text-comment">Loading...</div>';

  Promise.all([
    load_stat_file(stat_curr_date),
    load_stat_file(stat_prev_date)
  ])
  .then(([loaded_curr_items, loaded_prev_items]) => {
    stat_curr_items = loaded_curr_items;
    stat_prev_items = loaded_prev_items;

    process_filter();
  })
  .catch(err => {
    container.innerHTML = '<div class="text-center text-comment">Error: ' + err.message + '</div>';
  });
}

// EOF






