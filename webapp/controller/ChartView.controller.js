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

            const that = this;
            BusyIndicator.show(0);

            this._oModel.metadataLoaded().then(function () {
                that._oSmartFilterBar.attachInitialized(function () {
                    // 👇 Set default CALMONTH to current YYYYMM
                    const oNow = new Date();
                    const sDefaultMonth = oNow.getFullYear().toString() + ("0" + (oNow.getMonth() + 1)).slice(-2);
                    that._oSmartFilterBar.setFilterData({
                        CALMONTH: { ranges: [{ operation: "EQ", value1: sDefaultMonth }] }
                    });

                    // Trigger initial load
                    that.onSearch();
                    BusyIndicator.hide();
                });
            });
        },

        /** Trigger search/filter action */
        onSearch: function () {
            this._loadMaterialGroupsAndTabs();
        },

        /** Load only specific Material Groups and build tabs */
        _loadMaterialGroupsAndTabs: function () {
            const that = this;
            BusyIndicator.show(0);
            this._oIconTabBar.removeAllItems();

            // Allowed groups list
            const aAllowedGroups = [
                "Z050", "Z051", "Z069", "Z070",
                "Z072", "Z073", "Z074", "Z075",
                "Z077", "Z100", "Z101", "Z102"
            ];

            // Read the value help CDS
            this._oModel.read("/ZVH_MGRP_DEC", {
                urlParameters: { $select: "matl_group,txtsh", $top: "1000" },
                success: function (oData) {
                    const aFiltered = oData.results.filter(r =>
                        r.matl_group && aAllowedGroups.includes(r.matl_group)
                    );

                    if (!aFiltered.length) {
                        BusyIndicator.hide();
                        MessageToast.show("No matching Material Groups found");
                        return;
                    }

                    aFiltered.forEach(function (group) {
                        const sTitle = group.txtsh
                            ? `${group.txtsh} (${group.matl_group})`
                            : group.matl_group;

                        const oTab = new sap.m.IconTabFilter({
                            key: group.matl_group,
                            text: sTitle,
                            icon: "sap-icon://product"
                        });
                        that._oIconTabBar.addItem(oTab);
                    });

                    // Auto-load chart for first group
                    const oFirst = that._oIconTabBar.getItems()[0];
                    if (oFirst) {
                        that._createChartForGroup(oFirst.getKey(), oFirst);
                    }

                    BusyIndicator.hide();
                },
                error: function (err) {
                    BusyIndicator.hide();
                    console.error("Failed to read Material Groups:", err);
                    MessageToast.show("Error loading Material Groups");
                }
            });
        },

        /** When a tab (material group) is selected */
        onTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            const oTab = this._oIconTabBar.getItems().find(tab => tab.getKey() === sKey);
            if (oTab && !oTab.getContent().length) {
                this._createChartForGroup(sKey, oTab);
            }
        },

        /** Create chart & table for selected material group */
        _createChartForGroup: function (sGroup, oTab) {
            const that = this;
            let bBusyOpen = false; // 🔹 Track BusyDialog state manually

            // 🌀 Local BusyDialog
            const oBusyDialog = new sap.m.BusyDialog({
                text: "Loading chart data...",
                showCancelButton: false
            });
            oBusyDialog.open();
            bBusyOpen = true;

            this._readChartData(sGroup)
                .then(function (aData) {
                    // ✅ Close BusyDialog safely once data is fetched
                    if (bBusyOpen) {
                        oBusyDialog.close();
                        bBusyOpen = false;
                    }

                    // ✅ Handle case when no data available
                    if (!aData.length) {
                        const oNoDataVBox = new sap.m.VBox({
                            width: "100%",
                            height: "400px",
                            justifyContent: "Center",
                            alignItems: "Center",
                            items: [
                                new sap.m.FlexBox({
                                    direction: "Column",
                                    alignItems: "Center",
                                    justifyContent: "Center",
                                    items: [
                                        new sap.ui.core.Icon({
                                            src: "sap-icon://database",
                                            size: "4rem",
                                            color: "#6a6d70"
                                        }),
                                        new sap.m.Text({
                                            text: "No Data Available",
                                            design: "Bold",
                                            textAlign: "Center",
                                            class: "sapUiTinyMarginTop"
                                        }),
                                        new sap.m.Text({
                                            text: `No records found for Material Group ${sGroup}.`,
                                            textAlign: "Center",
                                            class: "sapUiTinyMarginTop"
                                        }),
                                        new sap.m.Button({
                                            text: "Try Again",
                                            icon: "sap-icon://refresh",
                                            type: "Emphasized",
                                            press: function () {
                                                that._createChartForGroup(sGroup, oTab);
                                            },
                                            class: "sapUiTinyMarginTop"
                                        })
                                    ]
                                })
                            ]
                        });

                        const oNoDataPanel = new sap.m.Panel({
                            backgroundDesign: "Transparent",
                            content: [oNoDataVBox],
                            customData: [
                                new sap.ui.core.CustomData({
                                    key: "style",
                                    value: "background: linear-gradient(180deg, #f9f9f9 0%, #f0f0f0 100%); border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);"
                                })
                            ]
                        });

                        oTab.removeAllContent();
                        oTab.addContent(oNoDataPanel);
                        return;
                    }

                    const sGroupDesc = oTab.getText().includes("(")
                        ? oTab.getText().split("(")[0].trim()
                        : sGroup;

                    // 📊 VizFrame setup
                    const oViz = new sap.viz.ui5.controls.VizFrame({
                        width: "100%",
                        height: "480px",
                        vizType: "column",
                        uiConfig: { applicationSet: "fiori" }
                    });

                    // 🎨 Random color palette
                    const generateColor = () => {
                        const hue = Math.floor(Math.random() * 360);
                        const saturation = 70 + Math.floor(Math.random() * 30);
                        const lightness = 45 + Math.floor(Math.random() * 15);
                        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
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
                        title: { text: `Actual Quantity – ${sGroupDesc} (${sGroup})`, visible: true },
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

                    // 📋 Table
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

                    // 🧩 ChartContainer
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
                                    new sap.m.Title({ text: `Daily Updates on Quantity for last month (MT) Material Group: ${sGroupDesc} (${sGroup})` }),
                                    new sap.m.ToolbarSpacer(),
                                    new sap.m.Button({
                                        icon: "sap-icon://refresh",
                                        tooltip: "Reload Data",
                                        press: () => that._createChartForGroup(sGroup, oTab)
                                    })
                                ]
                            }),
                        
                        ]
                    });
                    
                    
                    oTab.removeAllContent();
                    oTab.addContent(oVBox);

                    // 🟢 Close BusyDialog after rendering finishes
                    oViz.attachRenderComplete(function () {
                        if (bBusyOpen) {
                            oBusyDialog.close();
                            bBusyOpen = false;
                        }
                    });
                })
                .catch(function (err) {
                    if (bBusyOpen) {
                        oBusyDialog.close();
                        bBusyOpen = false;
                    }
                    console.error("Chart load failed:", sGroup, err);
                    sap.m.MessageToast.show("Error loading chart data");
                });
        },




        /** Fetch chart data filtered by Material Group + SmartFilterBar */
        _readChartData: function (sGroup) {
            const that = this;
            return new Promise(function (resolve, reject) {
                const aFilters = that._getSmartFilterBarFilters();
                aFilters.push(new Filter("matl_group", FilterOperator.EQ, sGroup));

                that._oModel.read("/Zsales_Daily_Update", {
                    filters: aFilters,
                    urlParameters: {
                        $select: "CALDAY,INV_QTY,matl_group",
                        $orderby: "CALDAY"
                    },
                    success: function (oData) {
                        const results = oData.results.map(row => ({
                            CALDAY: row.CALDAY,
                            INV_QTY: +row.INV_QTY || 0
                        }));
                        resolve(results);
                    },
                    error: reject
                });
            });
        },

        /** Extract filter values from SmartFilterBar */
        _getSmartFilterBarFilters: function () {
            const oSFB = this._oSmartFilterBar;
            if (!oSFB) return [];

            const oData = oSFB.getFilterData();
            const aFilters = [];

            if (oData.CALMONTH && oData.CALMONTH.ranges?.length) {
                const r = oData.CALMONTH.ranges[0];
                if (r.operation === "BT") {
                    aFilters.push(new Filter("CALMONTH", FilterOperator.BT, r.value1, r.value2));
                } else {
                    aFilters.push(new Filter("CALMONTH", FilterOperator.EQ, r.value1));
                }
            }
            return aFilters;
        },

        /** Open fullscreen view of the chart */
        _openFullScreen: function (oViz, sGroup) {
            const oDialog = new Dialog({
                contentWidth: "95%",
                contentHeight: "90%",
                resizable: true,
                draggable: true,
                title: `Full Screen - ${sGroup}`,
                content: [oViz.clone()],
                buttons: [
                    new Button({
                        text: "Close",
                        press: function () {
                            oDialog.close();
                            oDialog.destroy();
                        }
                    })
                ],
                afterClose: function () { oDialog.destroy(); }
            });
            oDialog.open();
        }
    });
});