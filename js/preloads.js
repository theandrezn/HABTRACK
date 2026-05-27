
    (function() {
      var preconnectOrigins = ["https://cdn.shopify.com","https://extensions.shopifycdn.com"];
      var scripts = ["/cdn/shopifycloud/checkout-web/assets/c1/polyfills.iRHCMwIP.js","/cdn/shopifycloud/checkout-web/assets/c1/app.Db252NJC.js","/cdn/shopifycloud/checkout-web/assets/c1/esnext-vendor.Bhne0xMB.js","/cdn/shopifycloud/checkout-web/assets/c1/browser.BawtSaPY.js","/cdn/shopifycloud/checkout-web/assets/c1/shared-is-shop-pay-active.DWPENszT.js","/cdn/shopifycloud/checkout-web/assets/c1/types-UnauthenticatedErrorModalPayload.BLPcrnWA.js","/cdn/shopifycloud/checkout-web/assets/c1/images-payment-icon.C_9SDN8i.js","/cdn/shopifycloud/checkout-web/assets/c1/utilities-shop-discount-offer.CZ9Fje7J.js","/cdn/shopifycloud/checkout-web/assets/c1/NotFound.CfJbwYuD.js","/cdn/shopifycloud/checkout-web/assets/c1/context-utilities.BKtYb51h.js","/cdn/shopifycloud/checkout-web/assets/c1/shared-unactionable-errors.CnQMnI0j.js","/cdn/shopifycloud/checkout-web/assets/c1/helpers-installmentsNotSupportedForAddress.CvFYUk8Y.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useShopPayCheckoutGqlVersion.SyOG7USa.js","/cdn/shopifycloud/checkout-web/assets/c1/graphql-ShopPayCheckoutSessionQuery.BT44Ni7m.js","/cdn/shopifycloud/checkout-web/assets/c1/helpers-setAddressErrors.D8ipvhsK.js","/cdn/shopifycloud/checkout-web/assets/c1/types-index.BbT8vKZX.js","/cdn/shopifycloud/checkout-web/assets/c1/images-flag-icon.C_eXYJRt.js","/cdn/shopifycloud/checkout-web/assets/c1/locale-en.BDsZZXo8.js","/cdn/shopifycloud/checkout-web/assets/c1/page-OnePage.CwIdYsu8.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useWalletsTimeout.BaLuYXgS.js","/cdn/shopifycloud/checkout-web/assets/c1/remember-me-hooks.DAYgmlhc.js","/cdn/shopifycloud/checkout-web/assets/c1/OffsitePaymentFailed.B9Kq9DXF.js","/cdn/shopifycloud/checkout-web/assets/c1/NoAddressLocationFullDetour.DthIgDi6.js","/cdn/shopifycloud/checkout-web/assets/c1/SplitDeliveryMerchandiseContainer.K3cQOYNm.js","/cdn/shopifycloud/checkout-web/assets/c1/useShopPayButtonClassName.CpaSs07B.js","/cdn/shopifycloud/checkout-web/assets/c1/ChangeCompanyLocationLink.Bs0wjhf5.js","/cdn/shopifycloud/checkout-web/assets/c1/WalletsSandbox-WalletSandbox.UXN4lPrj.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useUnauthenticatedErrorModal.JQ4PizRz.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useForceShopPayUrl.BQ6CSQK8.js","/cdn/shopifycloud/checkout-web/assets/c1/GooglePayButton-index.MxVHCa36.js","/cdn/shopifycloud/checkout-web/assets/c1/MarketsProDisclaimer.D_VvgIjR.js","/cdn/shopifycloud/checkout-web/assets/c1/ShippingGroupsSummaryLine.D1VVUKXb.js","/cdn/shopifycloud/checkout-web/assets/c1/StackedMerchandisePreview.CI3eTaWa.js","/cdn/shopifycloud/checkout-web/assets/c1/AutocompleteField-hooks.ChQfquI_.js","/cdn/shopifycloud/checkout-web/assets/c1/LocalizationExtensionField.CgfTgucK.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useShopPayPaymentRequiredMethod.D_IylHZZ.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useUpdateCheckoutAddress.Ck4K6-f-.js","/cdn/shopifycloud/checkout-web/assets/c1/WalletLogo.BWXI0tbn.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useGeneralPaymentErrorMessage.DPxFdGZ_.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useShowShopPayOptin.BqDxCA-N.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useShowCreateMoreAccountsGdprTreatment.CrvBgm0Y.js","/cdn/shopifycloud/checkout-web/assets/c1/Section.65aQmOm5.js","/cdn/shopifycloud/checkout-web/assets/c1/MobileOrderSummary.B31Zq13c.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useOnePageFormSubmit.CvBedtTl.js","/cdn/shopifycloud/checkout-web/assets/c1/PayPalOverCaptureInfoBanner.Crqx7Y4u.js","/cdn/shopifycloud/checkout-web/assets/c1/utilities-get-negotiation-input.Dyp0z5zM.js","/cdn/shopifycloud/checkout-web/assets/c1/shop-cash-constants.D3Y2E3yI.js","/cdn/shopifycloud/checkout-web/assets/c1/PaymentErrorBanner.D7eLmx1Y.js","/cdn/shopifycloud/checkout-web/assets/c1/StockProblems-StockProblemsLineItemList.Bu5cjb7C.js","/cdn/shopifycloud/checkout-web/assets/c1/DutyOptions.CCaO8-yk.js","/cdn/shopifycloud/checkout-web/assets/c1/ShipmentBreakdown.N3eOVNnb.js","/cdn/shopifycloud/checkout-web/assets/c1/MerchandiseModal.CSWg0s5G.js","/cdn/shopifycloud/checkout-web/assets/c1/extension-targets-shipping-options.BGFjb4tD.js","/cdn/shopifycloud/checkout-web/assets/c1/ShippingMethodSelector.7KHqxkVl.js","/cdn/shopifycloud/checkout-web/assets/c1/SubscriptionPriceBreakdown.CE3j5Q8d.js","/cdn/shopifycloud/checkout-web/assets/c1/hooks-useSubscribeMessenger.DBo3UOzH.js","/cdn/shopifycloud/checkout-web/assets/c1/component-RuntimeExtension.UxbPa6_H.js","/cdn/shopifycloud/checkout-web/assets/c1/AnnouncementRuntimeExtensions.DBMEjHN9.js","/cdn/shopifycloud/checkout-web/assets/c1/extension-targets-rendering-extension-targets.CoMRj6Kl.js","/cdn/shopifycloud/checkout-web/assets/c1/esm-browser-v4.BKrj-4V8.js","/cdn/shopifycloud/checkout-web/assets/c1/ExtensionsInner.Bq0c9puk.js"];
      var styles = ["/cdn/shopifycloud/checkout-web/assets/c1/assets/app.DQm2XSFQ.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/is-shop-pay-active.Bz45BrAn.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/UnauthenticatedErrorModalPayload.D1hsMvAK.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/index.NBwlNHi3.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/OnePage.Du-yF2xV.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/SplitDeliveryMerchandiseContainer.CRDql5Io.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/LocalizationExtensionField.CHFhA8b0.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/MobileOrderSummary.CqVkJv9Z.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/useOnePageFormSubmit.CFcgLtAD.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/WalletLogo.DSXJIrkc.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/ChangeCompanyLocationLink.uqpm88mq.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/Section.CU18S7Ap.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/useShopPayButtonClassName.BrcQzLuH.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/DutyOptions.LcqrKXE1.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/PayPalOverCaptureInfoBanner.CuS5ve3d.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/NoAddressLocationFullDetour.CpFaJIpx.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/WalletSandbox.CnR7qNLY.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/ShippingMethodSelector.B0hio2RO.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/SubscriptionPriceBreakdown.BSemv9tH.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/StackedMerchandisePreview.D6OuIVjc.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/RuntimeExtension.DWkDBM73.css","/cdn/shopifycloud/checkout-web/assets/c1/assets/AnnouncementRuntimeExtensions.qDifMJI9.css"];
      var fontPreconnectUrls = [];
      var fontPrefetchUrls = [];
      var imgPrefetchUrls = [];

      function preconnect(url, callback) {
        var link = document.createElement('link');
        link.rel = 'dns-prefetch preconnect';
        link.href = url;
        link.crossOrigin = '';
        link.onload = link.onerror = callback;
        document.head.appendChild(link);
      }

      function preconnectAssets() {
        var resources = preconnectOrigins.concat(fontPreconnectUrls);
        var index = 0;
        (function next() {
          var res = resources[index++];
          if (res) preconnect(res, next);
        })();
      }

      function prefetch(url, as, callback) {
        var link = document.createElement('link');
        if (link.relList.supports('prefetch')) {
          link.rel = 'prefetch';
          link.fetchPriority = 'low';
          link.as = as;
          if (as === 'font') link.type = 'font/woff2';
          link.href = url;
          link.crossOrigin = '';
          link.onload = link.onerror = callback;
          document.head.appendChild(link);
        } else {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.onloadend = callback;
          xhr.send();
        }
      }

      function prefetchAssets() {
        var resources = [].concat(
          scripts.map(function(url) { return [url, 'script']; }),
          styles.map(function(url) { return [url, 'style']; }),
          fontPrefetchUrls.map(function(url) { return [url, 'font']; }),
          imgPrefetchUrls.map(function(url) { return [url, 'image']; })
        );
        var index = 0;
        function run() {
          var res = resources[index++];
          if (res) prefetch(res[0], res[1], next);
        }
        var next = (self.requestIdleCallback || setTimeout).bind(self, run);
        next();
      }

      function onLoaded() {
        try {
          if (parseFloat(navigator.connection.effectiveType) > 2 && !navigator.connection.saveData) {
            preconnectAssets();
            prefetchAssets();
          }
        } catch (e) {}
      }

      if (document.readyState === 'complete') {
        onLoaded();
      } else {
        addEventListener('load', onLoaded);
      }
    })();
  