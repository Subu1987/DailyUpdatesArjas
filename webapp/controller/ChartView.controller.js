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
	"sap/m/Title"
], function (
	Controller, Filter, FilterOperator, MessageToast, BusyIndicator,
	IconTabFilter, VBox, VizFrame, FlattenedDataset, FeedItem,
	Button, OverflowToolbar, ToolbarSpacer, Dialog, Title
) {
	"use strict";

	return Controller.extend("com.arjas.zsddailysalesupd.controller.ChartView", {

		onInit: function () {
			this._oModel = this.getOwnerComponent().getModel();
			this._oSmartFilterBar = this.byId("smartFilterBar");
			this._oIconTabBar = this.byId("iconTabBar");
			this._aAllMaterialGroups = []; // ✅ cache for material groups

			const that = this;
			BusyIndicator.show(0);

			this._oModel.metadataLoaded().then(function () {
				that._oSmartFilterBar.attachInitialized(function () {
					// 👇 Default CALMONTH to current YYYYMM
					const oNow = new Date();
					const sDefaultMonth = oNow.getFullYear().toString() + ("0" + (oNow.getMonth() + 1)).slice(-2);
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
		},

		/** 🔍 Trigger search/filter action with validation */
		onSearch: function () {
			const oSFB = this._oSmartFilterBar;
			const oData = oSFB.getFilterData();

			const bHasMonth = (oData.CALMONTH && oData.CALMONTH.ranges && oData.CALMONTH.ranges.length > 0);
			const bHasDay = (oData.CALDAY && oData.CALDAY.ranges && oData.CALDAY.ranges.length > 0);

			// ⚠️ Validation: both fields entered
			if (bHasMonth && bHasDay) {
				sap.m.MessageBox.warning("Please choose either Calendar Month or Calendar Day, not both.");
				return;
			}

			// Continue with loading tabs
			this._loadMaterialGroupsAndTabs();
		},

		/** 📦 Load hardcoded Material Groups and build tabs (with caching) */
		_loadMaterialGroupsAndTabs: function () {
			const that = this;
			BusyIndicator.show(0);
			this._oIconTabBar.removeAllItems();

			const aAllowedGroups = [
				"Z050", "Z051", "Z069", "Z070",
				"Z072", "Z073", "Z074", "Z075",
				"Z077", "Z100", "Z101", "Z102"
			];

			// ✅ Use cached data if available
			if (this._aAllMaterialGroups && this._aAllMaterialGroups.length) {
				this._createTabsFromGroups(this._aAllMaterialGroups, aAllowedGroups);
				BusyIndicator.hide();
				return;
			}

			// 🔄 Fetch once from CDS if not cached
			this._oModel.read("/ZVH_MGRP_DEC", {
				urlParameters: { $select: "matl_group,txtsh", $top: "1000" },
				success: function (oData) {
					that._aAllMaterialGroups = oData.results; // cache results
					that._createTabsFromGroups(oData.results, aAllowedGroups);
					BusyIndicator.hide();
				},
				error: function (err) {
					BusyIndicator.hide();
					console.error("Failed to read Material Groups:", err);
					MessageToast.show("Error loading Material Groups");
				}
			});
		},

		/** 🧱 Create Tabs for Material Groups */
		_createTabsFromGroups: function (aData, aAllowedGroups) {
			const that = this;

			const aFiltered = aData.filter(r =>
				r.matl_group && aAllowedGroups.indexOf(r.matl_group) !== -1
			);

			if (!aFiltered.length) {
				MessageToast.show("No matching Material Groups found");
				return;
			}

			aFiltered.forEach(function (group) {
				const sTitle = group.txtsh ? `${group.txtsh} (${group.matl_group})` : group.matl_group;
				const oTab = new sap.m.IconTabFilter({
					key: group.matl_group,
					text: sTitle,
					icon: "sap-icon://product"
				});
				that._oIconTabBar.addItem(oTab);
			});

			const oFirst = that._oIconTabBar.getItems()[0];
			if (oFirst) {
				that._createChartForGroup(oFirst.getKey(), oFirst);
			}
		},

		/** 🏷️ When a tab (material group) is selected */
		onTabSelect: function (oEvent) {
			const sKey = oEvent.getParameter("key");
			const oTab = this._oIconTabBar.getItems().find(tab => tab.getKey() === sKey);
			if (oTab && !oTab.getContent().length) {
				this._createChartForGroup(sKey, oTab);
			}
		},

		/** 📊 Create chart & table for selected material group */
		_createChartForGroup: function (sGroup, oTab) {
			const that = this;
			let bBusyOpen = false;

			const oBusyDialog = new sap.m.BusyDialog({
				text: "Loading chart data...",
				showCancelButton: false
			});
			oBusyDialog.open();
			bBusyOpen = true;

			this._readChartData(sGroup)
				.then(function (aData) {
					if (bBusyOpen) {
						oBusyDialog.close();
						bBusyOpen = false;
					}

					if (!aData.length) {
						const oNoDataVBox = new sap.m.VBox({
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
									press: function () {
										that._createChartForGroup(sGroup, oTab);
									}
								})
							]
						});

						oTab.removeAllContent();
						oTab.addContent(oNoDataVBox);
						return;
					}

					const sGroupDesc = oTab.getText().indexOf("(") !== -1 ? oTab.getText().split("(")[0].trim() : sGroup;

					// 🏭 Get Plant from SmartFilterBar (for header display)
					const oFilterData = that._oSmartFilterBar.getFilterData();
					let sPlantHeader = "";
					if (oFilterData.plant && oFilterData.plant.ranges && oFilterData.plant.ranges.length) {
						sPlantHeader = " | Plant: " + oFilterData.plant.ranges[0].value1;
					}

					// VizFrame setup
					const oViz = new sap.viz.ui5.controls.VizFrame({
						width: "100%",
						height: "480px",
						vizType: "column",
						uiConfig: { applicationSet: "fiori" }
					});

					const generateColor = function () {
						const hue = Math.floor(Math.random() * 360);
						const saturation = 70 + Math.floor(Math.random() * 30);
						const lightness = 45 + Math.floor(Math.random() * 15);
						return `hsl(${hue},${saturation}%,${lightness}%)`;
					};
					const aColors = aData.map(() => generateColor());

					const oDataset = new sap.viz.ui5.data.FlattenedDataset({
						dimensions: [{ name: "Calendar Day", value: "{CALDAY}" }],
						measures: [{ name: "Actual Quantity", value: "{INV_QTY}" }],
						data: { path: "/results" }
					});

					const oModel = new sap.ui.model.json.JSONModel({ results: aData });
					oViz.setDataset(oDataset);
					oViz.setModel(oModel);

					oViz.setVizProperties({
						title: {
							text: `Actual Quantity – ${sGroupDesc} (${sGroup})`,
							visible: true
						},
						plotArea: {
							dataLabel: { visible: true },
							colorPalette: aColors,
							drawingEffect: "glossy"
						},
						legend: { visible: true },
						categoryAxis: { title: { visible: true, text: "Calendar Day" } },
						valueAxis: { title: { visible: true, text: "Quantity" } }
					});

					oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
						uid: "categoryAxis",
						type: "Dimension",
						values: ["Calendar Day"]
					}));
					oViz.addFeed(new sap.viz.ui5.controls.common.feeds.FeedItem({
						uid: "valueAxis",
						type: "Measure",
						values: ["Actual Quantity"]
					}));

					// Table
					const oTable = new sap.m.Table({
						inset: false,
						growing: true,
						columns: [
							new sap.m.Column({ header: new sap.m.Label({ text: "Calendar Day" }) }),
							new sap.m.Column({ header: new sap.m.Label({ text: "Actual Quantity" }) })
						]
					});

					oTable.bindItems({
						path: "/results",
						template: new sap.m.ColumnListItem({
							cells: [
								new sap.m.Text({ text: "{CALDAY}" }),
								new sap.m.ObjectNumber({ number: "{INV_QTY}" })
							]
						})
					});
					oTable.setModel(oModel);

					const oChartContent = new sap.suite.ui.commons.ChartContainerContent({
						icon: "sap-icon://horizontal-bar-chart",
						title: "Chart View",
						content: [oViz]
					});
					const oTableContent = new sap.suite.ui.commons.ChartContainerContent({
						icon: "sap-icon://table-chart",
						title: "Table View",
						content: [oTable]
					});
					const oChartContainer = new sap.suite.ui.commons.ChartContainer({
						showFullScreen: true,
						autoAdjustHeight: true,
						content: [oChartContent, oTableContent]
					});

					const oVBox = new sap.m.VBox({
						items: [
							new sap.m.Toolbar({
								content: [
									new sap.m.Title({
										text: "Daily Updates on Quantity" + sPlantHeader +
											" | Material Group: " + sGroupDesc + " (" + sGroup + ")"
									}),
									new sap.m.ToolbarSpacer(),
									new sap.m.Button({
										icon: "sap-icon://refresh",
										tooltip: "Reload Data",
										press: function () {
											that._createChartForGroup(sGroup, oTab);
										}
									})
								]
							}),
							oChartContainer
						]
					});

					oTab.removeAllContent();
					oTab.addContent(oVBox);
				})
				.catch(function (err) {
					if (bBusyOpen) oBusyDialog.close();
					console.error("Chart load failed:", sGroup, err);
					MessageToast.show("Error loading chart data");
				});
		},

		/** 📥 Fetch chart data filtered by CALMONTH / CALDAY / plant + Material Group */
		_readChartData: function (sGroup) {
			const that = this;
			return new Promise(function (resolve, reject) {
				const aFilters = that._getSmartFilterBarFilters();
				aFilters.push(new Filter("matl_group", FilterOperator.EQ, sGroup));

				that._oModel.read("/Zsales_Daily_Update", {
					filters: aFilters,
					urlParameters: { $select: "CALDAY,INV_QTY,matl_group,plant", $orderby: "CALDAY" },
					success: function (oData) {
						const results = oData.results.map(r => ({
							CALDAY: r.CALDAY,
							INV_QTY: +r.INV_QTY || 0
						}));
						resolve(results);
					},
					error: reject
				});
			});
		},

		/** 🧮 Extract filter values with priority logic: CALDAY > CALMONTH */
		_getSmartFilterBarFilters: function () {
			const oSFB = this._oSmartFilterBar;
			if (!oSFB) return [];

			const oData = oSFB.getFilterData();
			const aFilters = [];

			const bUseCalDay = (oData.CALDAY && oData.CALDAY.ranges && oData.CALDAY.ranges.length);

			if (bUseCalDay) {
				const r = oData.CALDAY.ranges[0];
				aFilters.push(new Filter("CALDAY", r.operation === "BT" ? FilterOperator.BT : FilterOperator.EQ, r.value1, r.value2));
			} else if (oData.CALMONTH && oData.CALMONTH.ranges && oData.CALMONTH.ranges.length) {
				const r = oData.CALMONTH.ranges[0];
				aFilters.push(new Filter("CALMONTH", r.operation === "BT" ? FilterOperator.BT : FilterOperator.EQ, r.value1, r.value2));
			}

			if (oData.plant && oData.plant.ranges && oData.plant.ranges.length) {
				const r = oData.plant.ranges[0];
				aFilters.push(new Filter("plant", FilterOperator.EQ, r.value1));
			}

			return aFilters;
		}
	});
});
