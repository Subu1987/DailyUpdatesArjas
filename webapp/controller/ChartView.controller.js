sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageToast",
	"sap/ui/core/BusyIndicator",
	"sap/m/IconTabFilter",
	"sap/m/VBox",
	"sap/viz/ui5/controls/VizFrame",
	"sap/viz/ui5/data/FlattenedDataset",
	"sap/viz/ui5/controls/common/feeds/FeedItem",
	"sap/m/Button",
	"sap/m/OverflowToolbar",
	"sap/m/ToolbarSpacer",
	"sap/m/Dialog",
	"sap/m/Title",
	"sap/m/MessageBox",
	"sap/suite/ui/commons/ChartContainer",
	"sap/suite/ui/commons/ChartContainerContent"
], function(
	Controller, Filter, FilterOperator, MessageToast, BusyIndicator,
	IconTabFilter, VBox, VizFrame, FlattenedDataset, FeedItem,
	Button, OverflowToolbar, ToolbarSpacer, Dialog, Title,
	MessageBox, ChartContainer, ChartContainerContent
) {
	"use strict";

	return Controller.extend("com.arjas.zsddailysalesupd.controller.ChartView", {

		//------------------------------------------------------
		// INIT
		//------------------------------------------------------
		onInit: function() {
			this._bWarningShown = false;
			this._oModel = this.getOwnerComponent().getModel();
			this._oSmartFilterBar = this.byId("smartFilterBar");
			this._oIconTabBar = this.byId("iconTabBar");
			this._aAllMaterialGroups = [];

			var that = this;
			BusyIndicator.show(0);

			this._oModel.metadataLoaded().then(function() {
				that._oSmartFilterBar.attachInitialized(function() {

					var oNow = new Date();
					var sDefaultMonth =
						oNow.getFullYear().toString() +
						("0" + (oNow.getMonth() + 1)).slice(-2);

					that._oSmartFilterBar.setFilterData({
						CALMONTH: {
							ranges: [{
								operation: "EQ",
								value1: sDefaultMonth
							}]
						}
					});

					that.onSearch();
					BusyIndicator.hide();
				});
			});

			// Create a JSONModel to store KPI values
			this._oKpiModel = new sap.ui.model.json.JSONModel({
				totalActualQty: 0
			});
			this.getView().setModel(this._oKpiModel, "kpiModel");
		},

		//------------------------------------------------------
		// SEARCH GO BUTTON
		//------------------------------------------------------
		onSearch: function() {
			this._bWarningShown = false; // ← reset so next warning can show
			var oSFB = this._oSmartFilterBar;
			var oData = oSFB.getFilterData();

			var bHasMonth =
				oData.CALMONTH &&
				oData.CALMONTH.ranges &&
				oData.CALMONTH.ranges.length > 0;

			var bHasDay =
				oData.CALDAY &&
				oData.CALDAY.ranges &&
				oData.CALDAY.ranges.length > 0;

			if (bHasMonth && bHasDay) {
				MessageBox.warning("Please choose either Calendar Month or Calendar Day, not both.");
				return;
			}

			this._loadMaterialGroupsAndTabs();

			var that = this;
			setTimeout(function() {
				var oIconTabBar = that._oIconTabBar;
				var aItems = oIconTabBar.getItems();
				var sKey = oIconTabBar.getSelectedKey();
				var oSelectedTab = null;

				if (sKey) {
					for (var i = 0; i < aItems.length; i++) {
						if (aItems[i].getKey() === sKey) {
							oSelectedTab = aItems[i];
							break;
						}
					}
				}

				if (!oSelectedTab) {
					oSelectedTab = aItems[0];
				}

				if (oSelectedTab) {
					that._createChartForGroup(oSelectedTab.getKey(), oSelectedTab);
				}
			}, 200);
		},

		//------------------------------------------------------
		// LOAD MATERIAL GROUP TABS
		//------------------------------------------------------
		// _loadMaterialGroupsAndTabs: function() {
		// 	var that = this;
		// 	BusyIndicator.show(0);

		// 	this._oIconTabBar.removeAllItems();

		// 	var aAllowedGroups = [
		// 		"Z050", "Z051", "Z069", "Z070",
		// 		"Z072", "Z073", "Z074", "Z075",
		// 		"Z077", "Z100", "Z101", "Z102"
		// 	];

		// 	if (this._aAllMaterialGroups.length) {
		// 		this._createTabsFromGroups(this._aAllMaterialGroups, aAllowedGroups);
		// 		BusyIndicator.hide();
		// 		return;
		// 	}

		// 	this._oModel.read("/ZVH_MGRP_DEC", {
		// 		urlParameters: {
		// 			$select: "matl_group,txtsh",
		// 			$top: "1000"
		// 		},
		// 		success: function(oData) {
		// 			that._aAllMaterialGroups = oData.results;
		// 			that._createTabsFromGroups(oData.results, aAllowedGroups);
		// 			BusyIndicator.hide();
		// 		},
		// 		error: function() {
		// 			BusyIndicator.hide();
		// 			MessageToast.show("Error loading Material Groups");
		// 		}
		// 	});
		// },

		_loadMaterialGroupsAndTabs: function() {
			var that = this;
			BusyIndicator.show(0);
			this._oIconTabBar.removeAllItems();

			// ✅ Whitelisted Material Groups
			var aAllowedGroups = [
				"Z050", "Z051", "Z069", "Z070",
				"Z072", "Z073", "Z074", "Z075",
				"Z077", "Z100", "Z101", "Z102"
			];

			this._oModel.read("/ZVH_MGRP_DEC", {
				urlParameters: {
					$select: "matl_group,txtsh",
					$top: "1000",
				},
				success: function(oData) {
					var mGroupDesc = {};

					console.log(oData);

					// ✅ Map available descriptions from backend
					oData.results.forEach(r => {
						if (r.matl_group && aAllowedGroups.includes(r.matl_group)) {
							mGroupDesc[r.matl_group] = r.txtsh || "";
						}
					});

					// ✅ Create all tabs — even if group not in OData
					// aAllowedGroups.forEach(function(sGroup) {
					// 	// var sDesc = mGroupDesc[sGroup] || "";
					// 	// var sTitle = sDesc ? `${sDesc} (${sGroup})` : sGroup;
					// 	// 🟢 FIXED — Use description from map
					// 	var sDesc = mGroupDesc[sGroup] || "";
					// 	var sTitle = sDesc ? `${sDesc} (${sGroup})` : sGroup;

					// 	var oTab = new sap.m.IconTabFilter({
					// 		key: sGroup,
					// 		text: sTitle,
					// 		tooltip: sTitle,
					// 		icon: "sap-icon://product",
					// 		// ✅ Add margin for better spacing
					// 		class: "sapUiSmallMarginEnd"
					// 	});

					// 	that._oIconTabBar.addItem(oTab);
					// });
					// ✅ Create all tabs — even if group not in OData (guarded against duplicates)
					aAllowedGroups.forEach(function(sGroup) {
						// skip if a tab with this key already exists
						var aExisting = that._oIconTabBar.getItems();
						var bExists = false;
						for (var j = 0; j < aExisting.length; j++) {
							if (aExisting[j].getKey && aExisting[j].getKey() === sGroup) {
								bExists = true;
								break;
							}
						}
						if (bExists) {
							return; // already present — skip
						}

						var sDesc = mGroupDesc[sGroup] || "";
						var sTitle = sDesc ? (sDesc + " (" + sGroup + ")") : sGroup;

						var oTab = new sap.m.IconTabFilter({
							key: sGroup,
							text: sTitle,
							tooltip: sTitle,
							icon: "sap-icon://product",
							// spacing class (optional)
							class: "sapUiSmallMarginEnd"
						});

						that._oIconTabBar.addItem(oTab);
					});

					// Load first tab
					// var sFirst = aAllowedGroups[0];
					// var oFirstTab = that._oIconTabBar.getItems()[0];
					// that._createChartForGroup(sFirst, oFirstTab);

					var sFirst = aAllowedGroups[0];
					var oFirstTab = that._oIconTabBar.getItems()[0];

					// FIX: force UI5 to treat first tab as selected
					that._oIconTabBar.setSelectedKey(sFirst);

					// FIX: now load the correct content
					that._createChartForGroup(sFirst, oFirstTab);

					BusyIndicator.hide();
				},
				error: function() {
					BusyIndicator.hide();
					MessageToast.show("Failed to fetch Material Groups");
				}
			});
		},

		_createTabsFromGroups: function(aData, aAllowedGroups) {
			var that = this;

			var aFiltered = aData.filter(function(r) {
				return r.matl_group && aAllowedGroups.indexOf(r.matl_group) !== -1;
			});

			aFiltered.forEach(function(group) {
				var sTitle = group.txtsh ?
					(group.txtsh + " (" + group.matl_group + ")") :
					group.matl_group;

				that._oIconTabBar.addItem(
					new IconTabFilter({
						key: group.matl_group,
						text: sTitle,
						icon: "sap-icon://product"
					})
				);
			});

			var oFirst = that._oIconTabBar.getItems()[0];
			if (oFirst) {
				that._createChartForGroup(oFirst.getKey(), oFirst);
			}
		},

		//------------------------------------------------------
		// TAB SELECT
		//------------------------------------------------------
		onTabSelect: function(oEvent) {

			this._bWarningShown = false; // ← reset warning for new tab

			var sKey = oEvent.getParameter("key");
			var aItems = this._oIconTabBar.getItems();
			var oTab = null;

			for (var i = 0; i < aItems.length; i++) {
				if (aItems[i].getKey() === sKey) {
					oTab = aItems[i];
					break;
				}
			}

			if (oTab && oTab.getContent().length === 0) {
				this._createChartForGroup(sKey, oTab);
			} else {
				this._createChartForGroup(sKey, oTab);
			}
		},

		//------------------------------------------------------
		// FINAL CHART CREATION WITH POST VALIDATION
		//------------------------------------------------------
		_createChartForGroup: function(sGroup, oTab) {
			var that = this;

			// var oBusyDialog = new Dialog({
			// 	title: "Loading",
			// 	content: new sap.m.BusyIndicator({
			// 		size: "2rem"
			// 	}),
			// 	type: "Message"
			// });
			// oBusyDialog.open();
			const oBusyDialog = new sap.m.BusyDialog({
				text: "Loading chart data...",
				showCancelButton: false
			});
			oBusyDialog.open();

			var oFilterInfo = this._getSmartFilterBarFilters();
			var aPlantValues = oFilterInfo.plantValues;

			//-----------------------------------------
			// 1️⃣ FIRST READ ACTUAL CHART DATA
			//-----------------------------------------
			this._readChartData(sGroup).then(function(aData) {

				//-----------------------------------------
				// 2️⃣ NOW VALIDATE PLANTS BASED ON REAL DATA
				//-----------------------------------------
				var plantMap = {};
				aData.forEach(function(row) {
					if (row.plant) {
						plantMap[row.plant] = true;
					}
				});

				var missing = [];
				for (var i = 0; i < aPlantValues.length; i++) {
					if (!plantMap[aPlantValues[i]]) {
						missing.push(aPlantValues[i]);
					}
				}

				if (missing.length > 0) {
					if (!that._bWarningShown) {
						that._bWarningShown = true; // prevent second popup
						MessageBox.warning(
							"No data found for plant(s): " + missing.join(", ")
						);
					}

				}

				//-----------------------------------------
				// 3️⃣ Continue chart render
				//-----------------------------------------
				if (oBusyDialog) {
					oBusyDialog.close();
				}

				if (!aData.length) {
					var oNoDataVBox = new sap.m.VBox({
						width: "100%",
						height: "400px",
						justifyContent: "Center",
						alignItems: "Center",
						items: [
							new sap.ui.core.Icon({
								src: "sap-icon://database",
								size: "4rem",
								color: "#6a6d70"
							}),
							new sap.m.Text({
								text: "No Data Available",
								design: "Bold",
								textAlign: "Center"
							}),
							new sap.m.Text({
								text: "No records found for Material Group " + sGroup + ".",
								textAlign: "Center"
							}),
							new sap.m.Button({
								text: "Try Again",
								icon: "sap-icon://refresh",
								type: "Emphasized",
								press: function() {
									that._createChartForGroup(sGroup, oTab);
								}
							})
						]
					});

					oTab.removeAllContent();
					oTab.addContent(oNoDataVBox);
					return;
				}

				//-----------------------------------------
				// BUILD CHART
				//-----------------------------------------
				var sGroupDesc = sGroup;
				var txt = oTab.getText();
				var idx = txt.indexOf("(");
				if (idx !== -1) {
					sGroupDesc = txt.substring(0, idx).trim();
				}

				var oFilterData = that._oSmartFilterBar.getFilterData();
				var sPlantHeader = "";

				if (oFilterData.plant &&
					oFilterData.plant.ranges &&
					oFilterData.plant.ranges.length > 0) {

					var vals = [];
					for (var i = 0; i < oFilterData.plant.ranges.length; i++) {
						vals.push(oFilterData.plant.ranges[i].value1);
					}
					sPlantHeader = " | Plant: " + vals.join(", ");
				}

				// After reading chart data from backend
				var totalQuantity = aData.reduce((sum, r) => sum + (r.INV_QTY || 0), 0);

				// Update the KPI model
				that._oKpiModel.setProperty("/totalActualQty", totalQuantity.toFixed(2));

				var oViz = new VizFrame({
					width: "100%",
					height: "480px",
					vizType: "column",
					uiConfig: {
						applicationSet: "fiori"
					}
				});

				// Add Popover
				const oPopOver = new sap.viz.ui5.controls.Popover({
					formatString: ["#,##0.00"]
				});
				oPopOver.connect(oViz.getVizUid());

				var randColor = function() {
					var h = Math.floor(Math.random() * 360);
					var s = 70 + Math.random() * 20;
					var l = 45 + Math.random() * 10;
					return "hsl(" + h + "," + s + "%," + l + "%)";
				};

				var aColors = [];
				for (var i = 0; i < aData.length; i++) {
					aColors.push(randColor());
				}

				var oDataset = new FlattenedDataset({
					dimensions: [{
						name: "Calendar Day",
						value: "{CALDAY}"
					}],
					measures: [{
						name: "Actual Quantity",
						value: "{INV_QTY}"
					}],
					data: {
						path: "/results"
					}
				});

				var oModel = new sap.ui.model.json.JSONModel({
					results: aData
				});

				oViz.setDataset(oDataset);
				oViz.setModel(oModel);

				oViz.setVizProperties({
					title: {
						text: "Actual Quantity – " + sGroupDesc + " (" + sGroup + ")",
						visible: true
					},
					plotArea: {
						dataLabel: {
							visible: true
						},
						colorPalette: aColors,
						drawingEffect: "glossy"
					}
				});

				oViz.addFeed(new FeedItem({
					uid: "categoryAxis",
					type: "Dimension",
					values: ["Calendar Day"]
				}));
				oViz.addFeed(new FeedItem({
					uid: "valueAxis",
					type: "Measure",
					values: ["Actual Quantity"]
				}));

				//---------------------------------------------------
				// TABLE
				//---------------------------------------------------
				var oTable = new sap.m.Table({
					columns: [
						new sap.m.Column({
							header: new sap.m.Label({
								text: "Calendar Day"
							})
						}),
						new sap.m.Column({
							header: new sap.m.Label({
								text: "Actual Quantity"
							})
						})
					]
				});

				oTable.bindItems({
					path: "/results",
					template: new sap.m.ColumnListItem({
						cells: [
							new sap.m.Text({
								text: "{CALDAY}"
							}),
							new sap.m.ObjectNumber({
								number: "{INV_QTY}"
							})
						]
					})
				});
				oTable.setModel(oModel);

				//---------------------------------------------------
				// CHART CONTAINER
				//---------------------------------------------------
				var oChartContent = new ChartContainerContent({
					icon: "sap-icon://horizontal-bar-chart",
					title: "Chart View",
					content: [oViz]
				});

				var oTableContent = new ChartContainerContent({
					icon: "sap-icon://table-chart",
					title: "Table View",
					content: [oTable]
				});

				var oContainer = new ChartContainer({
					showFullScreen: true,
					autoAdjustHeight: true,
					content: [oChartContent, oTableContent]
				});

				var oVBox = new VBox({
					items: [

						// --- Header Toolbar ---
						new sap.m.Toolbar({
							content: [
								new Title({
									text: "Daily Updates on Quantity " +
										sPlantHeader +
										" | Material Group: " +
										sGroupDesc +
										" (" +
										sGroup +
										")"
								}),
								new ToolbarSpacer(),
								new Button({
									icon: "sap-icon://refresh",
									press: function() {
										that._createChartForGroup(sGroup, oTab);
									}
								})
							]
						}),

						new sap.m.Toolbar({
							content: [
								new sap.m.Label({
									text: "Total Actual Quantity (MT) : ",
									design: "Bold"
								}).addStyleClass("sapUiTinyMarginEnd kpiLabel"),

								new sap.m.ObjectNumber({
									number: "{kpiModel>/totalActualQty}", // data binding
									emphasized: true,
									state: "Success"
								}).addStyleClass("kpiNumber"),

								new ToolbarSpacer()
							]
						}),

						// --- Chart/Table Container ---
						oContainer
					]
				});

				oTab.removeAllContent();
				oTab.addContent(oVBox);

			});
		},

		//------------------------------------------------------
		// READ DATA (SUM ACROSS PLANTS)
		//------------------------------------------------------
		_readChartData: function(sGroup) {
			var that = this;

			return new Promise(function(resolve, reject) {

				var oInfo = that._getSmartFilterBarFilters();
				var aFilters = oInfo.filters.slice();
				var aPlantValues = oInfo.plantValues;

				aFilters.push(new Filter("matl_group", FilterOperator.EQ, sGroup));

				if (aPlantValues.length) {
					var pf = [];
					for (var i = 0; i < aPlantValues.length; i++) {
						pf.push(new Filter("plant", FilterOperator.EQ, aPlantValues[i]));
					}
					aFilters.push(new Filter({
						filters: pf,
						and: false
					}));
				}

				if (oInfo.companyCodes && oInfo.companyCodes.length) {
					var ccFilters = [];

					oInfo.companyCodes.forEach(function(cc) {
						ccFilters.push(new Filter("comp_code", FilterOperator.EQ, cc));
					});

					aFilters.push(
						new Filter({
							filters: ccFilters,
							and: false // comp_code EQ 1000 OR comp_code EQ 2000
						})
					);
				}

				that._oModel.read("/Zsales_Daily_Update", {
					filters: aFilters,
					urlParameters: {
						$select: "CALDAY,INV_QTY,plant,matl_group,comp_code",
						$orderby: "CALDAY"
					},
					success: function(oData) {

						var map = {};

						(oData.results || []).forEach(function(r) {
							var day = r.CALDAY;
							var qty = parseFloat(r.INV_QTY) || 0;

							if (!map[day]) {
								map[day] = 0;
							}
							map[day] += qty;

							r.day = day;
						});

						var results = [];
						var keys = Object.keys(map).sort();

						for (var i = 0; i < keys.length; i++) {
							results.push({
								CALDAY: keys[i],
								INV_QTY: map[keys[i]],
								plant: (oData.results.find(function(x) {
									return x.CALDAY === keys[i];
								}) || {}).plant
							});
						}

						resolve(results);
					},
					error: reject
				});

			});
		},

		//------------------------------------------------------
		// GET SFB FILTERS SAFELY
		//------------------------------------------------------
		_getSmartFilterBarFilters: function() {
			var oSFB = this._oSmartFilterBar;

			if (!oSFB) {
				return {
					filters: [],
					plantValues: []
				};
			}

			var oData = oSFB.getFilterData();
			var aFilters = [];
			var aPlants = [];

			var aCompCodeFilters = [];

			var bUseDay =
				oData.CALDAY &&
				oData.CALDAY.ranges &&
				oData.CALDAY.ranges.length > 0;

			if (bUseDay) {
				var r = oData.CALDAY.ranges[0];
				var op = (r.operation === "BT") ? FilterOperator.BT : FilterOperator.EQ;
				aFilters.push(new Filter("CALDAY", op, r.value1, r.value2));
			}

			if (!bUseDay &&
				oData.CALMONTH &&
				oData.CALMONTH.ranges &&
				oData.CALMONTH.ranges.length > 0) {

				var rm = oData.CALMONTH.ranges[0];
				var opm = (rm.operation === "BT") ? FilterOperator.BT : FilterOperator.EQ;
				aFilters.push(new Filter("CALMONTH", opm, rm.value1, rm.value2));
			}

			if (oData.plant &&
				oData.plant.ranges &&
				oData.plant.ranges.length > 0) {

				for (var i = 0; i < oData.plant.ranges.length; i++) {
					var val = oData.plant.ranges[i].value1;
					if (val) {
						aPlants.push(val);
					}
				}
			}

			if (oData.comp_code &&
				oData.comp_code.ranges &&
				oData.comp_code.ranges.length > 0) {

				oData.comp_code.ranges.forEach(function(range) {
					if (range.value1) {
						// Create individual filter for each company code
						aCompCodeFilters.push(
							new Filter("comp_code", FilterOperator.EQ, range.value1)
						);
					}
				});

				// Add OR filter group into main filters
				if (aCompCodeFilters.length > 0) {
					aFilters.push(new Filter(aCompCodeFilters, true));
				}
			}

			return {
				filters: aFilters,
				plantValues: aPlants
			};
		}

	});
});