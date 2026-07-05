package br.com.sosmarceneiros.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalBrowser")
public class ExternalBrowserPlugin extends Plugin {
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("URL obrigatoria");
            return;
        }

        try {
            Uri uri = Uri.parse(url);

            Intent chromeIntent = new Intent(Intent.ACTION_VIEW, uri);
            chromeIntent.addCategory(Intent.CATEGORY_BROWSABLE);
            chromeIntent.setPackage("com.android.chrome");

            try {
                getActivity().startActivity(chromeIntent);
            } catch (Exception chromeError) {
                Intent fallbackIntent = new Intent(Intent.ACTION_VIEW, uri);
                fallbackIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                getActivity().startActivity(fallbackIntent);
            }

            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Nao foi possivel abrir o navegador", error);
        }
    }
}
