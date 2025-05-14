/*
  Ensures all HTML elements are fully loaded before running the script—crucial
  when selecting DOM elements like charts or map containers.
*/
document.addEventListener("DOMContentLoaded", function () {
  let boroughDim;
  // Initializes a Leaflet map centered over NYC.
  var map = L.map('mapID', {
    center: [40.7128, -74.0060],
    zoom: 11,
    zoomControl: false
  });
  // Adds a map.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map); // move zoom control to bottom right

  // Marker clustering layer
  const markerClusters = L.markerClusterGroup({
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    disableClusteringAtZoom: 15
  });
  map.addLayer(markerClusters);

  // Prevent event propagation on multiple containers. Prevents mouse/scroll events on floating UI panels 
  // (e.g., filters or legends) from affecting the map behind them.
  const containerIDs = ['mapTitle', 'mapOption', 'chart'];
  containerIDs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
  });

  //Legend
  var legend = L.control({ position: 'topright' });
  // Creates a fixed-position legend explaining the tree health color scheme. 
  legend.onAdd = function (map) {
    var div = L.DomUtil.create('div', ''),
      healthStatuses = ['Good', 'Fair', 'Poor', 'Unknown'],
      colors = ['#2ca02c', '#ff7f0e', '#d62728', '#7f7f7f'];

    // Create the legend container structure
    div.innerHTML = `
      <div id="mapLegend">
        <h4>Tree Health Legend</h4>
        <div class="legend-items-container">
          ${healthStatuses.map((status, i) => `
            <div class="legend-item">
              <div class="legend-color" style="background:${colors[i]}"></div>
              <span>${status}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return div;
  };

  legend.addTo(map);


  // Introduction modal
  var introModal = new bootstrap.Modal(document.getElementById('introModal'), {})
  introModal.toggle()

  // Crossfilter zone. Loads the tree census CSV with D3. 
  // Each row represents a tree record with attributes like species, borough, health, etc.
  d3.csv("data/NYCTreeCensus_2015.csv").then(function (data) {
    // Process data
    data.forEach(function (d) {
      d.OBJECTID = +d.OBJECTID;
      d.Year = +d.Year;
      d.latitude = +d.latitude;
      d.longitude = +d.longitude;
    });

    // Create crossfilter instance
    var ndx = crossfilter(data);

    // Dimensions and groups are created for filtering and charting by borough, species, health, and more.
    // Define dimensions.
    var boroughDim = ndx.dimension(function (d) { return d.boroname; });
    var speciesDim = ndx.dimension(function (d) { return d.spc_common; });
    var statusDim = ndx.dimension(function (d) { return d.status; });
    var healthDim = ndx.dimension(function (d) { return d.health; });
    var locationDim = ndx.dimension(d => [d.latitude, d.longitude]);

    // Define groups
    var boroughGroup = boroughDim.group().reduceCount();
    var speciesGroup = speciesDim.group().reduceCount();
    var statusGroup = statusDim.group().reduceCount();
    var healthGroup = healthDim.group().reduceCount();
    var all = ndx.groupAll();

    // Borough Polygons names and colors
    function getBoroughColor(name) {
      return name === "Manhattan" ? "#DAF7A6" :
        name === "Brooklyn" ? "#33a02c" :
          name === "Queens" ? "#368D99" :
            name === "Bronx" ? "#A5C016" :
              name === "Staten Island" ? "#02663D" :
                "#b2df8a";
    }

    // Borough Chart. A bar chart showing tree counts per borough using boroughDim
    var boroughChart = dc.barChart("#borough-chart");
    boroughChart
      .width(450)
      .height(300)
      .margins({ top: 10, right: 50, bottom: 50, left: 50 })
      .dimension(boroughDim)
      .group(boroughGroup)
      .transitionDuration(500)
      .x(d3.scaleBand())
      .xUnits(dc.units.ordinal)
      .elasticY(true)
      .xAxisLabel("Borough")
      .yAxisLabel("Number of Trees")
      .renderHorizontalGridLines(true)
      .colorAccessor(function (d) { return d.key; })
      .colors(d3.scaleOrdinal()
        .domain(["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"])
        .range(["#DAF7A6", "#33a02c", "#368D99", "#A5C016", "#02663D"])
      );


    // Species chart. A vertical list of species with counts.
    var speciesChart = dc.rowChart("#species-chart");
    speciesChart
      .width(450)
      .height(5000)
      .dimension(speciesDim)
      .group(speciesGroup)
      .elasticX(true)
      .label(function (d) {
        return d.key;
      })
      .title(function (d) {
        return d.key + ": " + d.value;
      })
      .colors(d3.scaleOrdinal().range(['#6baed6', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99']))
      .xAxis().ticks(5);

    // Health Chart. Shows proportions of trees by health status (Good, Fair, Poor, Unknown).
    var healthChart = dc.pieChart("#health-chart");
    healthChart
      .width(300)
      .height(300)
      .dimension(healthDim)
      .group(healthGroup)
      .innerRadius(80)

      .colors(d3.scaleOrdinal()
        .domain(['Good', 'Fair', 'Poor', 'Unknown'])
        .range(['#4CAF50', '#FFC107', '#F44336', '#9E9E9E'])
      )
      .legend(dc.legend().x(130).y(120).itemHeight(10).gap(5));

    // Map Borough selection donut
    var SelectionChart = dc.pieChart("#chart-ring-borough")
    SelectionChart
      .width(275)
      .height(275)
      .dimension(boroughDim)
      .group(boroughGroup)
      .innerRadius(80)
      .minAngleForLabel(60)
      .legend(dc.legend().x(120).y(110).itemHeight(10).gap(5))
      .colorAccessor(function (d) { return d.key; })
      .colors(d3.scaleOrdinal()
        .domain(["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"])
        .range(["#DAF7A6", "#33a02c", "#368D99", "#A5C016", "#02663D"])
      );

    // 
    /*Function to update tree markers
        1. Clears existing markers.

        2. Adds up to 25,000 circle markers using filtered Crossfilter data.

        3. Colors markers by health.

        4. Binds popup to each marker showing tree info.
    */
    function updateTreeMarkers() {
      markerClusters.clearLayers();

      const filteredData = ndx.allFiltered();
      //Tree display limit
      const displayLimit = 25000;

      filteredData.slice(0, displayLimit).forEach(d => {
        const marker = L.circleMarker([d.latitude, d.longitude], {
          radius: 5,
          fillColor: getHealthColor(d.health),
          color: "#000",
          weight: 0.5,
          opacity: 1,
          fillOpacity: 0.8
        });
        //format popups
        marker.bindPopup(`
          <strong>Species:</strong> ${d.spc_common}<br>
          <strong>Borough:</strong> ${d.boroname}<br>
          <strong>Status:</strong> ${d.status}<br>
          <strong>Health:</strong> ${d.health}
        `);

        marker.options.health = d.health;
        marker.options.species = d.spc_common;
        marker.options.borough = d.boroname;

        markerClusters.addLayer(marker);
      });
    }

    // Sets point color to health colors
    function getHealthColor(health) {
      return health === 'Good' ? '#2ca02c' :
        health === 'Fair' ? '#ff7f0e' :
          health === 'Poor' ? '#d62728' : '#7f7f7f';
    }

    // Add event listeners for marker updates
    boroughChart.on('filtered', function (chart, filter) {
      if (filter) {
        // Zooms map to layer
        boroughsLayer.eachLayer(function (layer) {
          if (layer.feature.properties.name === filter) {
            map.fitBounds(layer.getBounds(), {
              padding: [50, 50],
              maxZoom: 13
            });
          }
        });
      }
      updateBoroughHighlighting();
      updateTreeMarkers();
    });
    speciesChart.on('filtered', updateTreeMarkers);
    healthChart.on('filtered', updateTreeMarkers);
    SelectionChart.on('filtered', function (chart, filter) {
      if (filter) {
        // zoom map to layer
        boroughsLayer.eachLayer(function (layer) {
          if (layer.feature.properties.name === filter) {
            map.fitBounds(layer.getBounds(), {
              padding: [50, 50],
              maxZoom: 13
            });
          }
        });
      }
      updateBoroughHighlighting();
      updateTreeMarkers();
    });



    function style(feature) {
      return {
        fillColor: getBoroughColor(feature.properties.name),
        weight: 2,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.2
      };
    }
    // Link borough shapes to crossfilter. 
    // Clicking a borough shape sets a Crossfilter filter and updates charts and markers accordingly.
    function onEachFeature(feature, layer) {
      if (feature.properties && feature.properties.name) {
        layer.on('click', function () {
          var bname = feature.properties.name;
          boroughDim.filterAll();
          boroughDim.filter(bname);
          map.fitBounds(layer.getBounds(), {
            padding: [50, 50],
            maxZoom: 13
          });

          dc.redrawAll();
          updateBoroughHighlighting();
          updateTreeMarkers();
        });
      }
    }

    /**
     * Visually dims unselected boroughs.
     * Highlights selected ones with a border.
     */
    function updateBoroughHighlighting() {
      if (!boroughsLayer) return;

      var currentFilter = boroughDim.currentFilter();

      boroughsLayer.eachLayer(function (layer) {
        const bname = layer.feature.properties.name;
        if (!currentFilter) {

          layer.setStyle({
            fillColor: getBoroughColor(bname),
            fillOpacity: 0.4,
            opacity: 1,
            color: 'white',
            weight: 2
          });
        } else {
          // Apply highlight to selected borough
          if (bname === currentFilter ||
            (Array.isArray(currentFilter) && currentFilter.includes(bname))) {
            layer.setStyle({
              fillColor: getBoroughColor(bname),
              fillOpacity: 0.4,
              opacity: 1,
              color: '#222',
              weight: 4
            });
          } else {
            // Dim non-selected boroughs
            layer.setStyle({
              fillColor: "#ccc",
              fillOpacity: 0.2,
              opacity: 0.5,
              color: '#eee',
              weight: 1
            });
          }
        }
      });
    }

    let boroughsLayer; // global reference
    
    /**
     * Add GeoJSON with popups
     * Loads NYC borough boundaries and adds them as a Leaflet GeoJSON layer.
     * Enables click-to-filter functionality on each polygon.
     **/
    fetch('data/boroughs.geojson')
      .then(response => response.json())
      .then(data => {
        boroughsLayer = L.geoJSON(data, {
          style: style,
          onEachFeature: onEachFeature
        }).addTo(map);
      })
      .catch(error => console.error('Error loading GeoJSON data:', error));

    // Data Count
    dc.dataCount("#data-count")
      .dimension(ndx)
      .group(all)
      .html({
        some: '<strong>%filter-count</strong> selected out of <strong>%total-count</strong> trees',
        all: 'Showing all <strong>%total-count</strong> trees. Click charts to filter.'
      });

    // Render all charts
    dc.renderAll();

    //refresh buttons zone
    setupRefreshButtons();
    
    /**
     * Sets up click handlers for filter reset buttons.
     * Supports full reset and individual resets for boroughs, species, and health.
     */
    function setupRefreshButtons() {
      // Refresh all button
      document.getElementById('refreshMapBtn')?.addEventListener('click', function (e) {
        e.preventDefault();
        if (boroughDim) boroughDim.filterAll();
        if (SelectionChart) SelectionChart.filterAll();
        if (boroughChart) boroughChart.filterAll();
        if (speciesChart) speciesChart.filterAll();
        if (healthChart) healthChart.filterAll();

        dc.redrawAll();
        updateBoroughHighlighting();
        if (map) map.setView([40.7128, -74.0060], 11);

        const input = document.getElementById('reInput');
        if (input) input.value = '';

        updateTreeMarkers();
      });

      // Refresh Borough1
      document.getElementById('refreshborough')?.addEventListener('click', function (e) {
        e.preventDefault();
        if (boroughDim) boroughDim.filterAll();
        if (SelectionChart) SelectionChart.filterAll();
        if (boroughChart) boroughChart.filterAll();

        dc.redrawAll();
        updateBoroughHighlighting();
        if (map) map.setView([40.7128, -74.0060], 11);
        updateTreeMarkers();
      });

      // Refresh Borough2
      document.getElementById('refreshborough2')?.addEventListener('click', function (e) {
        e.preventDefault();
        if (boroughDim) boroughDim.filterAll();
        if (SelectionChart) SelectionChart.filterAll();
        if (boroughChart) boroughChart.filterAll();

        dc.redrawAll();
        updateBoroughHighlighting();
        if (map) map.setView([40.7128, -74.0060], 11);
        updateTreeMarkers();
      });

      // Refresh Species
      document.getElementById('refreshspecies')?.addEventListener('click', function (e) {
        e.preventDefault();
        if (speciesChart) speciesChart.filterAll();
        dc.redrawAll();
        updateTreeMarkers();
      });

      // Refresh Health
      document.getElementById('refreshhealth')?.addEventListener('click', function (e) {
        e.preventDefault();
        if (healthChart) healthChart.filterAll();
        dc.redrawAll();
        updateTreeMarkers();
      });
    }

    // Initial marker update
    updateTreeMarkers();

  }).catch(function (error) {
    console.error("Error loading data:", error);
    $("#chart").append('<div class="alert alert-danger">Error loading tree data</div>');
  });
});

// Responsive resize handling
$(window).on('resize', function () {
  dc.redrawAll();
});