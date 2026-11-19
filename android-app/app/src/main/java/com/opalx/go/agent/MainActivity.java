package com.opalx.go.agent;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends AppCompatActivity {

    private static final String URL_USB = "http://127.0.0.1:5238";
    private static final String URL_WIFI = "http://192.168.1.7:5238";
    private static final String URL_CLOUD = "https://complement-cross-milan-instructors.trycloudflare.com";
    private static final String WIFI_HOST = "192.168.1.7";
    private static final int WIFI_PORT = 5238;

    private static final String PREFS_NAME = "opalx_go_prefs";
    private static final String KEY_BASE_URL = "base_url";
    private static final String KEY_GUIDE_VISIBLE = "guide_visible";

    private static final int REQUEST_CAMERA_PERMISSION = 1001;
    private static final String DEFAULT_PRINT_JOB = "OpalX Chung Thu";

    private static final String PRINT_POLYFILL_JS =
            "(function(){"
                    + "if(window.__opalxPrintPolyfilled)return;"
                    + "window.__opalxPrintPolyfilled=true;"
                    + "var orig=typeof window.print==='function'?window.print.bind(window):null;"
                    + "window.print=function(){"
                    + "if(window.OpalxAndroid&&typeof window.OpalxAndroid.printCurrentPage==='function'){"
                    + "window.OpalxAndroid.printCurrentPage(document.title||'OpalX Chung Thu');"
                    + "return;"
                    + "}"
                    + "if(orig){orig();}"
                    + "};"
                    + "})();";

    private SharedPreferences prefs;
    private final ExecutorService executorService = Executors.newSingleThreadExecutor();

    private WebView webView;
    private WebView activePrintWebView;
    private SwipeRefreshLayout swipeRefresh;
    private ProgressBar progressBar;

    private TextView tvServerBadge;
    private TextView btnTestGuide;
    private TextView btnServer;
    private LinearLayout testGuideBar;
    private TextView btnStep1;
    private TextView btnStep2;
    private TextView btnStep3;
    private TextView btnStep4;
    private TextView tvStepTip;

    private LinearLayout llFallbackBanner;
    private ScrollView errorOverlay;
    private TextView tvErrorDetail;

    private String currentBaseUrl = URL_USB;
    private boolean isGuideVisible = true;
    private boolean wifiFallbackAttemptedForLoad = false;
    private boolean cloudFallbackAttemptedForLoad = false;
    private boolean mainFrameErrorOccurred = false;
    private String pendingRelativePath = "/";

    private PermissionRequest pendingWebPermissionRequest;
    private ValueCallback<Uri[]> pendingFilePathCallback;

    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
                if (pendingFilePathCallback == null) {
                    return;
                }
                Uri[] uris = null;
                if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                    Intent data = result.getData();
                    if (data.getClipData() != null && data.getClipData().getItemCount() > 0) {
                        int count = data.getClipData().getItemCount();
                        uris = new Uri[count];
                        for (int i = 0; i < count; i++) {
                            uris[i] = data.getClipData().getItemAt(i).getUri();
                        }
                    } else if (data.getData() != null) {
                        uris = new Uri[]{data.getData()};
                    }
                }
                pendingFilePathCallback.onReceiveValue(uris);
                pendingFilePathCallback = null;
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        currentBaseUrl = normalizeBaseUrl(prefs.getString(KEY_BASE_URL, URL_USB));
        isGuideVisible = false;

        bindViews();
        setupHeaderAndGuide();
        setupWebView();
        setupBackHandler();

        updateServerBadge();
        applyGuideVisibility();

        loadRoute("/");
    }

    private void bindViews() {
        tvServerBadge = findViewById(R.id.tvServerBadge);
        btnTestGuide = findViewById(R.id.btnTestGuide);
        btnServer = findViewById(R.id.btnServer);

        testGuideBar = findViewById(R.id.testGuideBar);
        btnStep1 = findViewById(R.id.btnStep1);
        btnStep2 = findViewById(R.id.btnStep2);
        btnStep3 = findViewById(R.id.btnStep3);
        btnStep4 = findViewById(R.id.btnStep4);
        tvStepTip = findViewById(R.id.tvStepTip);

        progressBar = findViewById(R.id.progressBar);
        swipeRefresh = findViewById(R.id.swipeRefresh);
        webView = findViewById(R.id.webView);

        llFallbackBanner = findViewById(R.id.llFallbackBanner);
        errorOverlay = findViewById(R.id.errorOverlay);
        tvErrorDetail = findViewById(R.id.tvErrorDetail);
    }

    private void setupHeaderAndGuide() {
        View.OnClickListener serverClickListener = v -> showServerDialog();
        tvServerBadge.setOnClickListener(serverClickListener);
        btnServer.setOnClickListener(serverClickListener);

        btnTestGuide.setOnClickListener(v -> {
            isGuideVisible = !isGuideVisible;
            prefs.edit().putBoolean(KEY_GUIDE_VISIBLE, isGuideVisible).apply();
            applyGuideVisibility();
        });

        btnStep1.setOnClickListener(v -> selectStepAndNavigate(1, "/enterprise", getString(R.string.step_1_tip)));
        btnStep2.setOnClickListener(v -> selectStepAndNavigate(2, "/bank", getString(R.string.step_2_tip)));
        btnStep3.setOnClickListener(v -> selectStepAndNavigate(3, "/opalx", getString(R.string.step_3_tip)));
        btnStep4.setOnClickListener(v -> selectStepAndNavigate(4, "/print/OPX-2026-0001", getString(R.string.step_4_tip)));

        findViewById(R.id.btnRetryUsb).setOnClickListener(v -> {
            wifiFallbackAttemptedForLoad = false;
            cloudFallbackAttemptedForLoad = false;
            currentBaseUrl = URL_USB;
            updateServerBadge();
            errorOverlay.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            loadRoute(pendingRelativePath);
        });

        findViewById(R.id.btnRetryWifi).setOnClickListener(v -> {
            wifiFallbackAttemptedForLoad = true;
            currentBaseUrl = URL_WIFI;
            updateServerBadge();
            errorOverlay.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            loadRoute(pendingRelativePath);
        });

        findViewById(R.id.btnOpenServerFromError).setOnClickListener(v -> showServerDialog());
    }

    private void applyGuideVisibility() {
        testGuideBar.setVisibility(isGuideVisible ? View.VISIBLE : View.GONE);
        btnTestGuide.setBackgroundResource(isGuideVisible
                ? R.drawable.bg_btn_header_active
                : R.drawable.bg_btn_header);
    }

    private void selectStepAndNavigate(int stepIndex, String routePath, String tipText) {
        highlightStep(stepIndex);
        tvStepTip.setText(tipText);
        wifiFallbackAttemptedForLoad = false;
        cloudFallbackAttemptedForLoad = false;
        loadRoute(routePath);
    }

    private void highlightStep(int stepIndex) {
        btnStep1.setBackgroundResource(stepIndex == 1 ? R.drawable.bg_step_chip_active : R.drawable.bg_step_chip);
        btnStep2.setBackgroundResource(stepIndex == 2 ? R.drawable.bg_step_chip_active : R.drawable.bg_step_chip);
        btnStep3.setBackgroundResource(stepIndex == 3 ? R.drawable.bg_step_chip_active : R.drawable.bg_step_chip);
        btnStep4.setBackgroundResource(stepIndex == 4 ? R.drawable.bg_step_chip_active : R.drawable.bg_step_chip);
    }

    private void syncStepFromUrl(String url) {
        if (TextUtils.isEmpty(url)) {
            return;
        }
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        if (path == null) {
            return;
        }
        if (path.startsWith("/enterprise")) {
            highlightStep(1);
            tvStepTip.setText(R.string.step_1_tip);
        } else if (path.startsWith("/bank")) {
            highlightStep(2);
            tvStepTip.setText(R.string.step_2_tip);
        } else if (path.startsWith("/opalx")) {
            highlightStep(3);
            tvStepTip.setText(R.string.step_3_tip);
        } else if (path.startsWith("/print")) {
            highlightStep(4);
            tvStepTip.setText(R.string.step_4_tip);
        } else {
            highlightStep(0);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        swipeRefresh.setColorSchemeColors(
                ContextCompat.getColor(this, R.color.opalx_accent_emerald),
                ContextCompat.getColor(this, R.color.opalx_accent_cyan)
        );
        swipeRefresh.setProgressBackgroundColorSchemeColor(
                ContextCompat.getColor(this, R.color.opalx_bg_surface)
        );
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.opalx_bg_primary));
        swipeRefresh.setOnChildScrollUpCallback((parent, child) -> webView.getScrollY() > 0);
        swipeRefresh.setOnRefreshListener(() -> {
            if (errorOverlay.getVisibility() == View.VISIBLE) {
                errorOverlay.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                wifiFallbackAttemptedForLoad = false;
                cloudFallbackAttemptedForLoad = false;
                loadRoute(pendingRelativePath);
            } else {
                wifiFallbackAttemptedForLoad = false;
                cloudFallbackAttemptedForLoad = false;
                webView.reload();
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUserAgentString(settings.getUserAgentString() + " OpalXGoAndroid/2.0");

        webView.addJavascriptInterface(new OpalxBridge(), "OpalxAndroid");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (pendingWebPermissionRequest == request) {
                        pendingWebPermissionRequest = null;
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (pendingFilePathCallback != null) {
                    pendingFilePathCallback.onReceiveValue(null);
                }
                pendingFilePathCallback = filePathCallback;
                try {
                    Intent chooserIntent = fileChooserParams != null
                            ? fileChooserParams.createIntent()
                            : new Intent(Intent.ACTION_GET_CONTENT).setType("*/*");
                    fileChooserLauncher.launch(chooserIntent);
                    return true;
                } catch (Exception e) {
                    pendingFilePathCallback = null;
                    Toast.makeText(MainActivity.this, "Không thể mở bộ chọn tệp", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                mainFrameErrorOccurred = false;
                progressBar.setVisibility(View.VISIBLE);
                syncStepFromUrl(url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                super.doUpdateVisitedHistory(view, url, isReload);
                syncStepFromUrl(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                swipeRefresh.setRefreshing(false);
                progressBar.setVisibility(View.GONE);

                if (!mainFrameErrorOccurred && !"about:blank".equals(url)) {
                    errorOverlay.setVisibility(View.GONE);
                    llFallbackBanner.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    pendingRelativePath = extractRelativePath(url);
                    view.evaluateJavascript(PRINT_POLYFILL_JS, null);
                    syncStepFromUrl(url);
                }
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request == null || !request.isForMainFrame()) {
                    return;
                }
                String failedUrl = request.getUrl() != null ? request.getUrl().toString() : currentBaseUrl;
                if ("about:blank".equals(failedUrl)) {
                    return;
                }

                mainFrameErrorOccurred = true;
                swipeRefresh.setRefreshing(false);
                progressBar.setVisibility(View.GONE);

                int errorCode = error != null ? error.getErrorCode() : -1;
                CharSequence desc = error != null ? error.getDescription() : "";
                String errorDesc = desc != null ? desc.toString() : "Connection failed";
                pendingRelativePath = extractRelativePath(failedUrl);

                if (URL_USB.equals(currentBaseUrl)
                        && !wifiFallbackAttemptedForLoad
                        && isConnectionError(errorCode, errorDesc)) {
                    wifiFallbackAttemptedForLoad = true;
                    tryAutoFallbackToWifi(pendingRelativePath, failedUrl, errorDesc);
                } else if (URL_WIFI.equals(currentBaseUrl)
                        && !cloudFallbackAttemptedForLoad
                        && isConnectionError(errorCode, errorDesc)) {
                    cloudFallbackAttemptedForLoad = true;
                    currentBaseUrl = URL_CLOUD;
                    updateServerBadge();
                    Toast.makeText(
                            MainActivity.this,
                            "Wi-Fi nội bộ bị chặn — Đã chuyển sang HTTPS Cloud",
                            Toast.LENGTH_SHORT
                    ).show();
                    loadRoute(pendingRelativePath);
                } else {
                    llFallbackBanner.setVisibility(View.GONE);
                    showConnectionError(failedUrl, errorDesc);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return false;
                }
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() != null ? uri.getScheme().toLowerCase(Locale.ROOT) : "";
                String host = uri.getHost() != null ? uri.getHost().toLowerCase(Locale.ROOT) : "";

                Uri baseUri = Uri.parse(currentBaseUrl);
                String baseHost = baseUri.getHost() != null ? baseUri.getHost().toLowerCase(Locale.ROOT) : "";

                String reqPath = uri.getPath() != null ? uri.getPath() : "";
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    boolean isForcedExternal = "dl.vietqr.io".equals(host)
                            || "snowtrace.io".equals(host)
                            || host.endsWith(".snowtrace.io")
                            || reqPath.startsWith("/api/apk");
                    if (!isForcedExternal && host.equals(baseHost)) {
                        return false;
                    }
                    openExternalUri(uri);
                    return true;
                }

                if ("intent".equals(scheme)) {
                    openIntentSchemeUrl(uri.toString());
                    return true;
                }

                openExternalUri(uri);
                return true;
            }
        });
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        if (request == null || request.getResources() == null) {
            return;
        }
        boolean asksVideo = Arrays.asList(request.getResources())
                .contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        if (!asksVideo) {
            request.deny();
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            if (pendingWebPermissionRequest != null && pendingWebPermissionRequest != request) {
                pendingWebPermissionRequest.deny();
            }
            pendingWebPermissionRequest = request;
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.CAMERA},
                    REQUEST_CAMERA_PERMISSION
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA_PERMISSION && pendingWebPermissionRequest != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                pendingWebPermissionRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                pendingWebPermissionRequest.deny();
                Toast.makeText(this, "Cần quyền Camera để quét QR", Toast.LENGTH_SHORT).show();
            }
            pendingWebPermissionRequest = null;
        }
    }

    private void setupBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    errorOverlay.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    private void loadRoute(String relativePath) {
        String safePath = (relativePath == null || relativePath.isEmpty()) ? "/" : relativePath;
        if (!safePath.startsWith("/")) {
            safePath = "/" + safePath;
        }
        pendingRelativePath = safePath;
        errorOverlay.setVisibility(View.GONE);
        llFallbackBanner.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(currentBaseUrl + safePath);
    }

    private void tryAutoFallbackToWifi(String relativePath, String usbFailedUrl, String usbErrorDesc) {
        llFallbackBanner.setVisibility(View.VISIBLE);
        webView.setVisibility(View.INVISIBLE);

        executorService.execute(() -> {
            boolean reachable = isEndpointReachable(WIFI_HOST, WIFI_PORT, 1800);
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) {
                    return;
                }
                llFallbackBanner.setVisibility(View.GONE);
                if (reachable) {
                    currentBaseUrl = URL_WIFI;
                    updateServerBadge();
                    errorOverlay.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    Toast.makeText(
                            MainActivity.this,
                            "USB ngắt kết nối — Đã chuyển sang Wi-Fi LAN 192.168.1.7",
                            Toast.LENGTH_SHORT
                    ).show();
                    loadRoute(relativePath);
                } else if (!cloudFallbackAttemptedForLoad) {
                    cloudFallbackAttemptedForLoad = true;
                    currentBaseUrl = URL_CLOUD;
                    updateServerBadge();
                    errorOverlay.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    Toast.makeText(
                            MainActivity.this,
                            "Wi-Fi nội bộ bị chặn — Đã chuyển sang HTTPS Cloud",
                            Toast.LENGTH_SHORT
                    ).show();
                    loadRoute(relativePath);
                } else {
                    showConnectionError(
                            usbFailedUrl + "\n(Đã thử Wi-Fi " + URL_WIFI + " & Cloud nhưng chưa phản hồi)",
                            usbErrorDesc
                    );
                }
            });
        });
    }

    private boolean isEndpointReachable(String host, int port, int timeoutMs) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            return true;
        } catch (IOException ignored) {
            return false;
        }
    }

    private boolean isConnectionError(int errorCode, String description) {
        if (errorCode == WebViewClient.ERROR_CONNECT
                || errorCode == WebViewClient.ERROR_TIMEOUT
                || errorCode == WebViewClient.ERROR_HOST_LOOKUP
                || errorCode == WebViewClient.ERROR_IO) {
            return true;
        }
        if (description == null) {
            return false;
        }
        String upper = description.toUpperCase(Locale.ROOT);
        return upper.contains("ERR_CONNECTION_REFUSED")
                || upper.contains("ERR_CONNECTION_TIMED_OUT")
                || upper.contains("ERR_ADDRESS_UNREACHABLE")
                || upper.contains("ERR_NAME_NOT_RESOLVED")
                || upper.contains("ERR_FAILED");
    }

    private void showConnectionError(String url, String errorDesc) {
        webView.setVisibility(View.INVISIBLE);
        errorOverlay.setVisibility(View.VISIBLE);
        String detail = "URL đang thử: " + url + "\nLỗi: " + (TextUtils.isEmpty(errorDesc) ? "Không có phản hồi" : errorDesc);
        tvErrorDetail.setText(detail);
    }

    private void updateServerBadge() {
        if (URL_USB.equals(currentBaseUrl)) {
            tvServerBadge.setText("● USB 127.0.0.1");
            tvServerBadge.setTextColor(ContextCompat.getColor(this, R.color.opalx_accent_emerald));
        } else if (URL_WIFI.equals(currentBaseUrl)) {
            tvServerBadge.setText("● Wi-Fi 192.168.1.7");
            tvServerBadge.setTextColor(ContextCompat.getColor(this, R.color.opalx_accent_cyan));
        } else if (URL_CLOUD.equals(currentBaseUrl)) {
            tvServerBadge.setText("● HTTPS Cloud");
            tvServerBadge.setTextColor(ContextCompat.getColor(this, R.color.opalx_accent_emerald));
        } else {
            tvServerBadge.setText("● Custom");
            tvServerBadge.setTextColor(ContextCompat.getColor(this, R.color.opalx_accent_amber));
        }
    }

    private void showServerDialog() {
        View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_server_config, null);
        EditText etServerUrl = dialogView.findViewById(R.id.etServerUrl);
        TextView btnPresetUsb = dialogView.findViewById(R.id.btnPresetUsb);
        TextView btnPresetWifi = dialogView.findViewById(R.id.btnPresetWifi);
        TextView btnPresetCloud = dialogView.findViewById(R.id.btnPresetCloud);

        etServerUrl.setText(currentBaseUrl);
        etServerUrl.setSelection(etServerUrl.getText().length());

        btnPresetUsb.setOnClickListener(v -> {
            etServerUrl.setText(URL_USB);
            etServerUrl.setSelection(URL_USB.length());
        });

        btnPresetWifi.setOnClickListener(v -> {
            etServerUrl.setText(URL_WIFI);
            etServerUrl.setSelection(URL_WIFI.length());
        });

        btnPresetCloud.setOnClickListener(v -> {
            etServerUrl.setText(URL_CLOUD);
            etServerUrl.setSelection(URL_CLOUD.length());
        });

        AlertDialog dialog = new AlertDialog.Builder(this, R.style.Theme_OpalXGo_Dialog)
                .setView(dialogView)
                .setPositiveButton("Lưu & Kết nối", (d, which) -> {
                    String raw = etServerUrl.getText() != null ? etServerUrl.getText().toString() : "";
                    String normalized = normalizeBaseUrl(raw);
                    if (TextUtils.isEmpty(normalized)) {
                        Toast.makeText(this, "URL không hợp lệ", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    prefs.edit().putString(KEY_BASE_URL, normalized).apply();
                    currentBaseUrl = normalized;
                    wifiFallbackAttemptedForLoad = false;
                    cloudFallbackAttemptedForLoad = false;
                    updateServerBadge();
                    loadRoute(pendingRelativePath);
                })
                .setNegativeButton("Đóng", null)
                .create();

        dialog.show();
    }

    private String normalizeBaseUrl(String rawUrl) {
        if (rawUrl == null) {
            return URL_USB;
        }
        String trimmed = rawUrl.trim();
        if (trimmed.isEmpty()) {
            return URL_USB;
        }
        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            if (trimmed.startsWith("127.0.0.1")
                    || trimmed.startsWith("localhost")
                    || trimmed.startsWith("192.168.")
                    || trimmed.startsWith("10.")) {
                trimmed = "http://" + trimmed;
            } else {
                trimmed = "https://" + trimmed;
            }
        }
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    private String extractRelativePath(String fullUrl) {
        if (TextUtils.isEmpty(fullUrl)) {
            return "/";
        }
        Uri uri = Uri.parse(fullUrl);
        String path = uri.getEncodedPath();
        if (TextUtils.isEmpty(path)) {
            path = "/";
        }
        String query = uri.getEncodedQuery();
        if (!TextUtils.isEmpty(query)) {
            return path + "?" + query;
        }
        return path;
    }

    private void openIntentSchemeUrl(String intentUrl) {
        try {
            Intent intent = Intent.parseUri(intentUrl, Intent.URI_INTENT_SCHEME);
            try {
                startActivity(intent);
            } catch (ActivityNotFoundException notFound) {
                String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                if (!TextUtils.isEmpty(fallbackUrl)) {
                    openExternalUri(Uri.parse(fallbackUrl));
                } else {
                    Toast.makeText(this, "Chưa cài đặt ứng dụng ngân hàng cho liên kết này", Toast.LENGTH_SHORT).show();
                }
            }
        } catch (Exception e) {
            Toast.makeText(this, "Không thể mở liên kết ứng dụng ngân hàng", Toast.LENGTH_SHORT).show();
        }
    }

    private void openExternalUri(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Không tìm thấy ứng dụng hỗ trợ liên kết: " + uri.getScheme(), Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "Không thể mở liên kết ngoài", Toast.LENGTH_SHORT).show();
        }
    }

    private void startPrintJob(WebView targetWebView, String jobTitle) {
        if (isFinishing() || isDestroyed() || targetWebView == null) {
            return;
        }
        PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            Toast.makeText(this, "Thiết bị không hỗ trợ dịch vụ In", Toast.LENGTH_SHORT).show();
            return;
        }
        String safeTitle = !TextUtils.isEmpty(jobTitle) && !jobTitle.trim().isEmpty()
                ? jobTitle.trim()
                : DEFAULT_PRINT_JOB;
        PrintDocumentAdapter printAdapter = targetWebView.createPrintDocumentAdapter(safeTitle);
        printManager.print(safeTitle, printAdapter, new PrintAttributes.Builder().build());
    }

    private void destroyActivePrintWebView() {
        if (activePrintWebView != null) {
            activePrintWebView.stopLoading();
            activePrintWebView.destroy();
            activePrintWebView = null;
        }
    }

    @Override
    protected void onDestroy() {
        executorService.shutdownNow();
        destroyActivePrintWebView();
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private class OpalxBridge {

        @JavascriptInterface
        public void printHtml(final String htmlContent, final String jobTitle) {
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) {
                    return;
                }
                if (TextUtils.isEmpty(htmlContent)) {
                    Toast.makeText(MainActivity.this, "Không có nội dung HTML để in", Toast.LENGTH_SHORT).show();
                    return;
                }

                destroyActivePrintWebView();

                WebView printWebView = new WebView(MainActivity.this);
                WebSettings printSettings = printWebView.getSettings();
                printSettings.setJavaScriptEnabled(true);
                printSettings.setDefaultTextEncodingName("UTF-8");
                printSettings.setAllowFileAccess(false);

                activePrintWebView = printWebView;
                final AtomicBoolean printStarted = new AtomicBoolean(false);

                printWebView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        if (printStarted.compareAndSet(false, true)) {
                            startPrintJob(view, jobTitle);
                        }
                    }
                });

                printWebView.loadDataWithBaseURL(
                        currentBaseUrl,
                        htmlContent,
                        "text/html",
                        "UTF-8",
                        null
                );
            });
        }

        @JavascriptInterface
        public void printCurrentPage(final String jobTitle) {
            runOnUiThread(() -> {
                if (webView == null || isFinishing() || isDestroyed()) {
                    return;
                }
                startPrintJob(webView, jobTitle);
            });
        }

        @JavascriptInterface
        public void showToast(final String msg) {
            if (TextUtils.isEmpty(msg)) {
                return;
            }
            runOnUiThread(() -> {
                if (!isFinishing() && !isDestroyed()) {
                    Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }
}
