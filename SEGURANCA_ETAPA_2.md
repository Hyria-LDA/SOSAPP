# Etapa 2 — proteção da exclusão de imagens

Correção local preparada em 19/09/2026. Ainda não publicada no Supabase.

## Mudança

As funções `delete-material` e `admin-delete-company` agora validam os caminhos de arquivos antes de usar a credencial privilegiada para apagá-los.

- Fotos e miniaturas precisam estar em `empresa/anuncio/arquivo`, correspondendo ao anúncio consultado com autorização.
- Logos precisam estar em `usuario/arquivo`, correspondendo ao proprietário da empresa consultada.
- URLs completas precisam pertencer à origem do Supabase configurada e ao bucket esperado. URLs assinadas antigas continuam aceitas quando apontam para caminhos autorizados.
- Caminhos de outra empresa, outro anúncio, ambíguos ou em formatos desconhecidos são preservados. O servidor registra um aviso e retorna `cleanup_warnings`; a exclusão do registro autorizado continua. Isso pode deixar arquivos antigos para limpeza manual, deliberadamente evitando apagar objetos sem vínculo verificável.
- A autenticação e as exigências de proprietário/administrador continuam presentes.

Nenhuma migração de banco, mudança de planos ou alteração visual está incluída nesta etapa.

## Verificação

Executar na raiz do projeto, usando Node com suporte nativo a TypeScript (validado com Node 26.5):

```sh
node --test tests/storage-cleanup.test.mjs
```

A suíte contém 22 testes de formatos existentes, isolamento entre empresas/anúncios, caminhos manipulados, exclusão de logos e autorização. Inclui execução do código real das duas funções com autenticação, banco e armazenamento simulados, sem rede ou exclusões reais.

Também foram verificadas a tipagem da aplicação, a tipagem do utilitário novo e as regras de lint dos três arquivos de servidor alterados. A checagem TypeScript da aplicação não cobre as funções Deno; os testes de handlers transpõem seu código e usam dependências simuladas. Ainda é necessária validação no ambiente Supabase antes da publicação em produção.

## Publicação e validação posterior

Enviar código ao GitHub não atualiza automaticamente estas funções. Publicar ambas as funções no Supabase junto do utilitário compartilhado, inicialmente em ambiente de teste.

Validar com duas contas e arquivos descartáveis: exclusão de anúncio com foto/miniatura próprias; tentativa de referência a imagem de outra conta; exclusão administrativa com logo própria; usuário comum impedido de excluir empresa. Verificar respostas e logs de `cleanup_warnings`.

Para reverter o comportamento, restaurar as versões anteriores das duas funções e republicá-las. O utilitário novo não muda o banco. Reverter reintroduz a vulnerabilidade, portanto deve ser uma medida temporária se houver incompatibilidade não detectada.
